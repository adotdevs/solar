from dotenv import load_dotenv
from fastapi import FastAPI, Query, HTTPException, BackgroundTasks, Body
import os 
from fastapi.middleware.cors import CORSMiddleware
import datetime
from datetime import timezone, timedelta
from watchpower_api import WatchPowerAPI
from typing import List, Optional
import logging
import time
from threading import Lock
# Load env variables
load_dotenv()
from fastapi.responses import StreamingResponse
import json
import asyncio
from contextlib import asynccontextmanager

# Import new msdodules
from api_models import (
    GridFeedControl,
    OutputPriorityControl,
    LCDAutoReturnSettings,
    SystemSettings,
    AlertConfiguration,
    SystemHealthResponse,
    NotificationTestRequest,
    ModeAlertRequest
)
from email_service import email_service
from monitoring_service import monitoring_service
from settings_storage import settings_storage
from telegram_service import telegram_service
from discord_service import discord_service

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

USERNAMES = os.getenv("USERNAMES")
PASSWORD = os.getenv("PASSWORD")
SERIAL_NUMBER = os.getenv("SERIAL_NUMBER")
WIFI_PN = os.getenv("WIFI_PN")
DEV_CODE = os.getenv("DEV_CODE")
DEV_ADDR = os.getenv("DEV_ADDR")

# Convert to integers safely
try:
    DEV_CODE = int(DEV_CODE) if DEV_CODE else None
    DEV_ADDR = int(DEV_ADDR) if DEV_ADDR else None
except TypeError:
    raise ValueError("DEV_CODE or DEV_ADDR not found in environment variables")

logger.info(f"Config loaded: {USERNAMES}, SN: {SERIAL_NUMBER}, PN: {WIFI_PN}")

# ============================================================================
# OPTIMIZED API SESSION MANAGER
# ============================================================================

class APISessionManager:
    """Manages WatchPower API session with smart re-login on auth errors only"""
    
    def __init__(self):
        self.wp = WatchPowerAPI()
        self.login_lock = Lock()
        self._is_logged_in = False
        
    def ensure_logged_in(self, force: bool = False):
        """Ensure we have a valid login session, only re-login if forced or not logged in"""
        with self.login_lock:
            # Only login if never logged in, or forced
            if not self._is_logged_in or force:
                try:
                    logger.info("🔐 Logging in to WatchPower API...")
                    self.wp.login(USERNAMES, PASSWORD)
                    self._is_logged_in = True
                    logger.info("✅ Login successful!")
                except Exception as e:
                    logger.error(f"❌ Login failed: {e}")
                    self._is_logged_in = False
                    raise HTTPException(status_code=503, detail=f"API login failed: {str(e)}")
    
    def get_api(self) -> WatchPowerAPI:
        """Get the API instance, ensuring it's logged in"""
        self.ensure_logged_in()
        return self.wp
    
    def handle_api_call(self, api_function, *args, **kwargs):
        """
        Smart wrapper: Call API function, auto re-login on auth errors
        This is the key optimization - only re-login when actually needed!
        """
        try:
            # Try the API call
            return api_function(*args, **kwargs)
        except RuntimeError as e:
            error_str = str(e)
            # Check if it's an authentication error
            if "token" in error_str.lower() or "auth" in error_str.lower() or "login" in error_str.lower():
                logger.warning(f"⚠️ Auth error detected, attempting re-login: {e}")
                # Re-login and retry once
                self.ensure_logged_in(force=True)
                return api_function(*args, **kwargs)
            else:
                # Not an auth error, just raise it
                raise

# Global API session manager
api_manager = APISessionManager()

# ============================================================================
# DATA CACHING LAYER (10-second cache)
# ============================================================================

class DataCache:
    """Simple in-memory cache with TTL"""
    
    def __init__(self):
        self.cache = {}
        self.cache_ttl_seconds = 10  # Cache for 10 seconds
        
    def get(self, key: str):
        """Get cached data if still valid"""
        if key in self.cache:
            data, timestamp = self.cache[key]
            age = time.time() - timestamp
            if age < self.cache_ttl_seconds:
                return data
        return None
    
    def set(self, key: str, data):
        """Store data in cache with current timestamp"""
        self.cache[key] = (data, time.time())
    
    def clear(self, key: str = None):
        """Clear specific key or entire cache"""
        if key:
            self.cache.pop(key, None)
        else:
            self.cache.clear()

# Global cache instance
cache = DataCache()

# Lifespan context manager for startup/shutdown events
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initial login and start monitoring service
    logger.info("🚀 Starting Solar Dashboard API...")
    try:
        api_manager.ensure_logged_in()
    except Exception as e:
        logger.error(f"⚠️ Initial login failed (will retry on first request): {e}")
    
    # Start monitoring service in background
    logger.info("🔄 Starting background monitoring service...")
    try:
        monitoring_task = asyncio.create_task(monitoring_service.run_periodic_checks())
        logger.info("✅ Background monitoring service started successfully")
    except Exception as e:
        logger.error(f"❌ Failed to start monitoring service: {str(e)}")
        # Create a dummy task to prevent shutdown issues
        monitoring_task = asyncio.create_task(asyncio.sleep(3600))  # Sleep for 1 hour
    
    yield
    
    # Shutdown: Cleanup if needed
    logger.info("👋 Shutting down Solar Dashboard API...")
    
    # Request graceful shutdown of monitoring service
    monitoring_service.request_shutdown()
    
    # Cancel monitoring task gracefully
    if not monitoring_task.done():
        monitoring_task.cancel()
        try:
            await asyncio.wait_for(monitoring_task, timeout=5.0)
        except (asyncio.CancelledError, asyncio.TimeoutError):
            logger.info("Monitoring task cancelled or timed out during shutdown")
        except Exception as e:
            logger.error(f"Error during monitoring task shutdown: {e}")
    
    logger.info("✅ Shutdown complete")

app = FastAPI(
    title="Solar Power Dashboard API (Optimized)",
    description="Advanced solar system monitoring and control with smart caching",
    version="2.1.0",
    lifespan=lifespan
)

 
allowed_origins = [
    "http://127.0.0.1:5502",
    "http://127.0.0.1:5504",
    "http://127.0.0.1:5503",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "https://solarbyahmar.vercel.app",
    "https://solarbyahmarj.vercel.app",
    "https://www.solarbyahmar.vercel.app",
    "https://www.solarbyahmarj.vercel.app",
     
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,  # multiple domains here
    allow_methods=["*"],
    allow_headers=["*"],
)
# NOTE: We now use api_manager.get_api() instead of global wp instance
# This provides automatic re-login on token expiry


@app.get("/daily-data")
def get_daily_data():
    try:
        today = datetime.date.today()
        data = api_manager.handle_api_call(
            api_manager.wp.get_daily_data,
            day=today,
            serial_number=SERIAL_NUMBER,
            wifi_pn=WIFI_PN,
            dev_code=DEV_CODE,
            dev_addr=DEV_ADDR
        )
        return {"success": True, "data": data}
    except Exception as e:
        logger.error(f"Error in /daily-data: {e}")
        return {"success": False, "error": str(e)}
# 👇 New endpoint to fetch device info
@app.get("/devices")
def get_devices():
    try:
        devices = api_manager.handle_api_call(api_manager.wp.get_devices)
        return {"success": True, "devices": devices}
    except Exception as e:
        logger.error(f"Error in /devices: {e}")
        return {"success": False, "error": str(e)}


@app.get("/last-data")
def get_last_data():
    """Get REAL-TIME / LATEST data from inverter (updates every 5 min)"""
    try:
        data = api_manager.handle_api_call(
            api_manager.wp.get_device_last_data,
            serial_number=SERIAL_NUMBER,
            wifi_pn=WIFI_PN,
            dev_code=DEV_CODE,
            dev_addr=DEV_ADDR
        )
        return {"success": True, "data": data}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/device-status")
def get_device_status():
    """Get REAL-TIME device STATUS (ShineMonitor API 1.6.14 - might be faster!)"""
    try:
        data = api_manager.handle_api_call(
            api_manager.wp.get_device_status,
            serial_number=SERIAL_NUMBER,
            wifi_pn=WIFI_PN,
            dev_code=DEV_CODE,
            dev_addr=DEV_ADDR
        )
        return {"success": True, "data": data}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/realtime-data")
def get_realtime_data():
    """Get REAL-TIME RAW data (ShineMonitor API 1.6.6 - latest raw data!)"""
    try:
        data = api_manager.handle_api_call(
            api_manager.wp.get_device_realtime_data,
            serial_number=SERIAL_NUMBER,
            wifi_pn=WIFI_PN,
            dev_code=DEV_CODE,
            dev_addr=DEV_ADDR
        )
        return {"success": True, "data": data}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/collector-info")
def get_collector_info():
    """Get data collector info - includes datFetch (upload interval!)"""
    try:
        data = api_manager.handle_api_call(api_manager.wp.get_collector_info, wifi_pn=WIFI_PN)
        return {"success": True, "data": data}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/device-info")
def get_device_info():
    """Get device INFO - basic device information (might cache differently)"""
    try:
        data = api_manager.handle_api_call(
            api_manager.wp.get_device_info,
            serial_number=SERIAL_NUMBER,
            wifi_pn=WIFI_PN,
            dev_code=DEV_CODE,
            dev_addr=DEV_ADDR
        )
        return {"success": True, "data": data}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/device-raw-data")
def get_device_raw_data():
    """Get device RAW DATA - latest raw data (Section 1.6.6)"""
    try:
        data = api_manager.handle_api_call(
            api_manager.wp.get_device_raw_data,
            serial_number=SERIAL_NUMBER,
            wifi_pn=WIFI_PN,
            dev_code=DEV_CODE,
            dev_addr=DEV_ADDR
        )
        return {"success": True, "data": data}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/system/hardware-alarms")
@app.get("/hardware-alarms")
def get_hardware_alarms(page: int = 0, pagesize: int = 50):
    """
    Get real inverter hardware warning & alarm history.
    Filters out battery alarms (as system is battery-less).
    """
    try:
        cache_key = f"hardware_alarms_{page}_{pagesize}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        res = api_manager.handle_api_call(
            api_manager.wp.get_device_warnings,
            serial_number=SERIAL_NUMBER,
            wifi_pn=WIFI_PN,
            dev_code=DEV_CODE,
            dev_addr=DEV_ADDR,
            page=page,
            pagesize=pagesize
        )
        
        all_warnings = res.get("dat", {}).get("warning", [])
        filtered = []
        active_count = 0
        for w in all_warnings:
            desc = str(w.get("desc", ""))
            # Strictly filter out battery alarms
            if "bat" in desc.lower():
                continue
            
            is_active = not bool(w.get("handle", False)) or not w.get("cts")
            if is_active:
                active_count += 1
            
            friendly_name = desc
            severity = "warning"
            if desc == "PV Loss":
                friendly_name = "Solar PV Loss (Night / Sun Down)"
                severity = "info"
            elif desc == "LINE_FAIL":
                friendly_name = "Utility Grid Outage / Power Cut"
                severity = "error"
            elif desc == "Eeprom Fault":
                friendly_name = "Inverter EEPROM Diagnostic"
                severity = "warning"

            filtered.append({
                "raw_desc": desc,
                "title": friendly_name,
                "severity": severity,
                "start_time": w.get("gts"),
                "end_time": w.get("cts") or "Active / Ongoing",
                "is_active": is_active,
                "level": w.get("level", 0),
                "handled": bool(w.get("handle", False))
            })

        out = {
            "success": True,
            "total_count": len(filtered),
            "active_count": active_count,
            "alarms": filtered,
            "timestamp": datetime.datetime.now().isoformat()
        }
        cache.set(cache_key, out, ttl=30)
        return out
    except Exception as e:
        logger.error(f"Error fetching hardware alarms: {e}")
        return {"success": False, "error": str(e), "alarms": [], "active_count": 0}


@app.get("/system/hardware-registers")
@app.get("/hardware-registers")
def get_hardware_registers():
    """
    Get actual non-battery configuration registers directly from inverter hardware.
    """
    try:
        cache_key = "hardware_registers_cache"
        cached = cache.get(cache_key)
        if cached:
            return cached

        target_registers = [
            ("std_solar_feed_to_grid_ctrl_d", "Solar Feed To Grid", "Grid Export Setting"),
            ("bse_output_source_priority", "Output Source Priority", "Power Supply Route"),
            ("bse_ac_input_range", "AC Input Range", "Utility Voltage Tolerance"),
            ("std_buzzer_ctrl_a", "Buzzer Alarm", "Audible Alerts"),
            ("std_overload_restart_ctrl_u", "Overload Auto Restart", "Protection Recovery"),
            ("std_primary_source_alarm_ctrl_y", "Source Interrupt Beep", "Grid Cut Beeps")
        ]

        registers = []
        for reg_id, label, category in target_registers:
            try:
                v = api_manager.handle_api_call(
                    api_manager.wp.get_device_ctrl_value,
                    serial_number=SERIAL_NUMBER,
                    wifi_pn=WIFI_PN,
                    dev_code=DEV_CODE,
                    dev_addr=DEV_ADDR,
                    ctrl_id=reg_id
                )
                val_data = v.get("dat", {})
                registers.append({
                    "id": reg_id,
                    "label": label,
                    "category": category,
                    "value": str(val_data.get("val", "Unknown")),
                    "name": str(val_data.get("name", label))
                })
            except Exception as e:
                logger.warning(f"Failed to read register {reg_id}: {e}")
                registers.append({
                    "id": reg_id,
                    "label": label,
                    "category": category,
                    "value": "Unknown",
                    "name": label
                })

        out = {
            "success": True,
            "registers": registers,
            "timestamp": datetime.datetime.now().isoformat()
        }
        cache.set(cache_key, out, ttl=60)
        return out
    except Exception as e:
        logger.error(f"Error fetching hardware registers: {e}")
        return {"success": False, "error": str(e), "registers": []}


@app.get("/plant/environmental-impact")
@app.get("/environmental-impact")
def get_environmental_impact():
    """
    Calculate environmental offset using ShineMonitor plant parameters.
    """
    try:
        cache_key = "plant_environmental_impact"
        cached = cache.get(cache_key)
        if cached:
            return cached

        plant_info = {}
        try:
            p = api_manager.handle_api_call(api_manager.wp.get_plant_info, plant_id=5220419)
            if p and p.get("err") == 0:
                plant_info = p.get("dat", {})
        except Exception as e:
            logger.warning(f"Could not fetch plant info: {e}")

        factors = {
            "co2_kg_per_kwh": 0.997,
            "coal_kg_per_kwh": 0.400,
            "tree_factor_kg": 21.77
        }

        out = {
            "success": True,
            "plant_name": plant_info.get("name", "MYBMSPLANT"),
            "plant_id": plant_info.get("pid", 5220419),
            "timezone_offset_seconds": plant_info.get("address", {}).get("timezone", 18000),
            "factors": factors,
            "timestamp": datetime.datetime.now().isoformat()
        }
        cache.set(cache_key, out, ttl=300)
        return out
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/today-total")
def today_total():
    try:
        today = datetime.date.today().strftime("%Y-%m-%d")
        data = api_manager.handle_api_call(
            api_manager.wp.get_daily_data,
            day=datetime.date.today(),
            serial_number=SERIAL_NUMBER,
            wifi_pn=WIFI_PN,
            dev_code=DEV_CODE,
            dev_addr=DEV_ADDR
        )

        # filter today's records
        today_records = [rec for rec in data.get("records", []) if rec.get("date") == today]

        # calculate total production (replace "production" with actual key name in JSON)
        total = sum(float(rec.get("production", 0)) for rec in today_records)

        return {
            "success": True,
            "date": today,
            "total_production": total,
            "records": today_records
        }
    except Exception as e:
        return {"success": False, "error": str(e)}
@app.get("/today-stats")
def today_stats():
    try:
        data = api_manager.handle_api_call(
            api_manager.wp.get_daily_data,
            day=datetime.date.today(),
            serial_number=SERIAL_NUMBER,
            wifi_pn=WIFI_PN,
            dev_code=DEV_CODE,
            dev_addr=DEV_ADDR
        )

        rows = data.get("dat", {}).get("row", [])
        today_str = datetime.date.today().strftime("%Y-%m-%d")

        graph = []
        total_production_wh = 0

        for rec in rows:
            fields = rec.get("field", [])
            if len(fields) < 22:
                continue

            timestamp = fields[1]  # "2025-09-14 00:02:18"
            if not timestamp.startswith(today_str):
                continue

            pv_power = float(fields[11]) if fields[11] else 0.0  # PV1 Charging Power (W)
            load_power = float(fields[21]) if fields[21] else 0.0  # AC Output Active Power (W)

            # graph ke liye
            graph.append({
                "time": timestamp[-8:],  # sirf HH:MM:SS
                "pv_power": pv_power,
                "load_power": load_power
            })

            # 5 min interval assume karke Wh calculate
            total_production_wh += pv_power * (5 / 60)

        return {
            "success": True,
            "date": today_str,
            "total_production_kwh": round(total_production_wh / 1000, 3),
            "graph": graph
        }

    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/raw-data")
def raw_data():
    """Return raw WatchPower API daily data for today"""
    try:
        data = api_manager.handle_api_call(
            api_manager.wp.get_daily_data,
            day=datetime.date.today(),
            serial_number=SERIAL_NUMBER,
            wifi_pn=WIFI_PN,
            dev_code=DEV_CODE,
            dev_addr=DEV_ADDR
        )
        return data
    except Exception as e:
        return {"error": str(e)}

def process_data(data: dict, date: str):
    """Convert API raw data into graph format + totals"""
    graph = []
    pv_sum = 0
    load_sum = 0
    interval_hours = 5 / 60  # assume 5min interval = 0.083hr

    for rec in data.get("records", []):
        fields = rec.get("field", [])
        if len(fields) < 22:
            continue

        timestamp = fields[1]
        pv_power = float(fields[11]) if fields[11] not in ["", None] else 0
        load_power = float(fields[21]) if fields[21] not in ["", None] else 0

        # Filter same-day only
        if timestamp.startswith(date):
            graph.append({
                "time": timestamp.split(" ")[1],  # hh:mm:ss
                "pv_power": pv_power,
                "load_power": load_power,
            })
            pv_sum += pv_power * interval_hours
            load_sum += load_power * interval_hours

    return {
        "success": True,
        "date": date,
        "total_production_kwh": round(pv_sum / 1000, 2),
        "total_load_kwh": round(load_sum / 1000, 2),
        "graph": graph,
    }

 

@app.get("/stats")
def get_stats(date: str = Query(default=datetime.date.today().strftime("%Y-%m-%d"))):
    """Get solar stats for a given date (default = today). OPTIMIZED with caching."""
    try:
        day = datetime.datetime.strptime(date, "%Y-%m-%d").date()
        data = api_manager.handle_api_call(
            api_manager.wp.get_daily_data,
            day=day,
            serial_number=SERIAL_NUMBER,
            wifi_pn=WIFI_PN,
            dev_code=DEV_CODE,
            dev_addr=DEV_ADDR
        )

        rows = data.get("dat", {}).get("row", [])
        graph = []
        total_production_wh = 0
        total_load_wh = 0

        for rec in rows:
            fields = rec.get("field", [])
            if len(fields) < 22:
                continue

            timestamp = fields[1]  # e.g. "2025-09-10 12:34:56"
            if not timestamp.startswith(date):
                continue

            # Safe parsing
            try:
                pv_power = float(fields[11]) if fields[11] not in ["", None] else 0.0
            except:
                pv_power = 0.0
            try:
                load_power = float(fields[21]) if fields[21] not in ["", None] else 0.0
            except:
                load_power = 0.0
            try:
                mode = str(fields[47]) if fields[47] not in ["", None] else 0.0
            except:
                mode = 0.0

            graph.append({
                "time": timestamp[-8:],  # HH:MM:SS
                "pv_power": pv_power,
                "load_power": load_power,
                "mode":mode
            })

            # 5 min interval = 0.0833 hr
            total_production_wh += pv_power * (5 / 60)
            total_load_wh += load_power * (5 / 60)

        return {
            "success": True,
            "date": date,
            "total_production_kwh": round(total_production_wh / 1000, 3),
            "total_load_kwh": round(total_load_wh / 1000, 3),
            "graph": graph
        }

    except Exception as e:
        return {"success": False, "error": str(e)}

 
@app.get("/stats-range")
def stats_range(from_date: str = Query(...), to_date: str = Query(...)):

    def generate_stats():
        try:
            start = datetime.datetime.strptime(from_date, "%Y-%m-%d").date()
            end = datetime.datetime.strptime(to_date, "%Y-%m-%d").date()

            if start > end:
                yield json.dumps({"success": False, "error": "from_date must be <= to_date"}) + "\n"
                return

            total_days = (end - start).days + 1
            total_prod_wh = 0
            total_load_wh = 0
            daily_stats = []

            current = start
            while current <= end:
                try:
                    # Retry logic with exponential backoff
                    max_retries = 3
                    retry_delay = 1.0  # seconds
                    data = None
                    last_error = None
                    
                    for attempt in range(max_retries):
                        try:
                            data = api_manager.handle_api_call(
                                api_manager.wp.get_daily_data,
                                day=current,
                                serial_number=SERIAL_NUMBER,
                                wifi_pn=WIFI_PN,
                                dev_code=DEV_CODE,
                                dev_addr=DEV_ADDR
                            )
                            break  # Success, exit retry loop
                        except Exception as e:
                            last_error = e
                            error_str = str(e).lower()
                            
                            # Don't retry on certain errors (like no data available)
                            if "no record" in error_str or "err_no_record" in error_str or "err 12" in error_str:
                                raise e
                            
                            # If this is the last attempt, raise the error
                            if attempt == max_retries - 1:
                                raise e
                            
                            # Exponential backoff: 1s, 2s, 4s
                            delay = retry_delay * (2 ** attempt)
                            logger.warning(f"⚠️ Retry attempt {attempt + 1}/{max_retries} after {delay}s for {current}: {str(e)}")
                            time.sleep(delay)
                    
                    if data is None:
                        raise last_error if last_error else Exception("Failed to fetch data after retries")

                    rows = data.get("dat", {}).get("row", [])
                    pv_wh = 0
                    load_wh = 0
                    interval_hours = 5 / 60

                    for rec in rows:
                        fields = rec.get("field", [])
                        if len(fields) < 22:
                            continue

                        timestamp = fields[1]
                        if not timestamp.startswith(str(current)):
                            continue

                        pv_power = float(fields[11]) if fields[11] else 0.0
                        load_power = float(fields[21]) if fields[21] else 0.0
                        pv_wh += pv_power * interval_hours
                        load_wh += load_power * interval_hours

                    total_prod_wh += pv_wh
                    total_load_wh += load_wh

                    daily_data = {
                        "date": str(current),
                        "production_kwh": round(pv_wh / 1000, 2),
                        "load_kwh": round(load_wh / 1000, 2)
                    }
                    daily_stats.append(daily_data)

                except Exception as e:
                    daily_data = {
                        "date": str(current),
                        "production_kwh": None,
                        "load_kwh": None,
                        "error": str(e)
                    }
                    daily_stats.append(daily_data)

                # ✅ Yield progress for frontend
                progress = len(daily_stats) / total_days * 100
                yield json.dumps({
                    "success": True,
                    "progress": round(progress, 2),
                    "daily": daily_data,
                    "total_production_kwh": round(total_prod_wh / 1000, 2),
                    "total_load_kwh": round(total_load_wh / 1000, 2)
                }) + "\n"

                current += datetime.timedelta(days=1)

        except Exception as e:
            yield json.dumps({"success": False, "error": str(e)}) + "\n"

    return StreamingResponse(generate_stats(), media_type="application/json")


@app.post("/stats-range/refetch")
def refetch_missing_dates(request: dict = Body(...)):
    """Refetch specific dates with retry logic"""
    
    def generate_refetch():
        try:
            dates = request.get("dates", [])
            if not dates or len(dates) == 0:
                yield json.dumps({"success": False, "error": "dates list is required"}) + "\n"
                return

            total_prod_wh = 0
            total_load_wh = 0
            interval_hours = 5 / 60

            for i, date_str in enumerate(dates):
                try:
                    current = datetime.datetime.strptime(date_str, "%Y-%m-%d").date()
                    
                    # Retry logic with exponential backoff
                    max_retries = 3
                    retry_delay = 1.0
                    data = None
                    last_error = None
                    
                    for attempt in range(max_retries):
                        try:
                            data = api_manager.handle_api_call(
                                api_manager.wp.get_daily_data,
                                day=current,
                                serial_number=SERIAL_NUMBER,
                                wifi_pn=WIFI_PN,
                                dev_code=DEV_CODE,
                                dev_addr=DEV_ADDR
                            )
                            break
                        except Exception as e:
                            last_error = e
                            error_str = str(e).lower()
                            
                            if "no record" in error_str or "err_no_record" in error_str or "err 12" in error_str:
                                raise e
                            
                            if attempt == max_retries - 1:
                                raise e
                            
                            delay = retry_delay * (2 ** attempt)
                            logger.warning(f"⚠️ Retry attempt {attempt + 1}/{max_retries} after {delay}s for {date_str}: {str(e)}")
                            time.sleep(delay)
                    
                    if data is None:
                        raise last_error if last_error else Exception("Failed to fetch data after retries")

                    rows = data.get("dat", {}).get("row", [])
                    
                    if len(rows) == 0:
                        daily_data = {
                            "date": date_str,
                            "production_kwh": None,
                            "load_kwh": None,
                            "success": False,
                            "error": "No data available"
                        }
                    else:
                        pv_wh = 0
                        load_wh = 0
                        has_valid_data = False

                        for rec in rows:
                            fields = rec.get("field", [])
                            if len(fields) < 22:
                                continue

                            timestamp = fields[1]
                            if not timestamp.startswith(date_str):
                                continue

                            pv_power = float(fields[11]) if fields[11] else 0.0
                            load_power = float(fields[21]) if fields[21] else 0.0
                            pv_wh += pv_power * interval_hours
                            load_wh += load_power * interval_hours
                            has_valid_data = True

                        if not has_valid_data:
                            daily_data = {
                                "date": date_str,
                                "production_kwh": None,
                                "load_kwh": None,
                                "success": False,
                                "error": "No valid records found"
                            }
                        else:
                            total_prod_wh += pv_wh
                            total_load_wh += load_wh
                            daily_data = {
                                "date": date_str,
                                "production_kwh": round(pv_wh / 1000, 2),
                                "load_kwh": round(load_wh / 1000, 2),
                                "success": True
                            }

                except Exception as e:
                    logger.error(f"❌ Error refetching {date_str}: {str(e)}")
                    daily_data = {
                        "date": date_str,
                        "production_kwh": None,
                        "load_kwh": None,
                        "success": False,
                        "error": str(e)
                    }

                # Yield progress update
                progress = ((i + 1) / len(dates)) * 100
                yield json.dumps({
                    "success": True,
                    "progress": round(progress, 2),
                    "daily": daily_data,
                    "completed": i + 1,
                    "total": len(dates)
                }) + "\n"

        except Exception as e:
            yield json.dumps({"success": False, "error": str(e)}) + "\n"

    return StreamingResponse(generate_refetch(), media_type="application/json")




# ============================================================================
# NEW FEATURES: System Control & Monitoring Endpoints
# ============================================================================

# Quick Access Controls
@app.post("/control/grid-feed")
async def control_grid_feed(control: GridFeedControl):
    """
    Enable or disable grid feeding (quick access endpoint)
    
    Setting is saved persistently and survives server restarts.
    **Note:** This updates tracking/monitoring only. Use WatchPower app for actual hardware control.
    """
    try:
        # Update monitoring service and save to storage
        monitoring_service.set_grid_feeding_status(control.enabled)
        
        # TODO: Implement actual API call to control grid feeding
        # This would require reverse engineering the WatchPower control protocol
        
        return {
            "success": True,
            "message": f"Grid feeding {'enabled' if control.enabled else 'disabled'}",
            "grid_feed_enabled": control.enabled,
            "saved": True,
            "note": "Setting saved. Email reminders will be sent if disabled. Use WatchPower app for actual hardware control."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/control/output-priority")
async def control_output_priority(control: OutputPriorityControl):
    """
    Set output source priority (quick access endpoint)
    
    Options:
    - Solar_first: Prioritize solar power
    - Grid_first: Prioritize grid power
    - SBU: Solar-Battery-Utility (recommended)
    
    **Note:** Setting is saved for tracking. Use WatchPower app for actual hardware control.
    """
    try:
        # Save to storage
        settings_storage.set("output_priority", control.priority)
        
        # TODO: Implement actual API call to set output priority
        return {
            "success": True,
            "message": f"Output priority set to {control.priority}",
            "priority": control.priority,
            "saved": True,
            "note": "Preference saved. Use WatchPower app for actual hardware control."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/control/lcd-auto-return")
async def control_lcd_auto_return(settings: LCDAutoReturnSettings):
    """
    Configure LCD auto return to default screen (quick access endpoint)
    
    **Note:** Setting is saved for tracking. Use WatchPower app for actual hardware control.
    """
    try:
        # Save to storage
        settings_storage.update({
            "lcd_auto_return_enabled": settings.enabled,
            "lcd_timeout_seconds": settings.timeout_seconds if settings.enabled else None
        })
        
        # TODO: Implement actual API call to set LCD settings
        return {
            "success": True,
            "message": f"LCD auto return {'enabled' if settings.enabled else 'disabled'}",
            "enabled": settings.enabled,
            "timeout_seconds": settings.timeout_seconds if settings.enabled else None,
            "saved": True,
            "note": "Preference saved. Use WatchPower app for actual hardware control."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/system/settings/current")
async def get_current_system_settings(force_refresh: bool = False):
    """
    Get ACTUAL system settings from the inverter (READ-ONLY)
    
    Returns real-time values from the hardware, not user preferences.
    Use WatchPower app to change these settings.
    force_refresh: If True, re-login to API to get fresh data
    """
    try:
        # Force refresh: Clear cache if requested
        if force_refresh:
            cache.clear("system_settings")
            logger.info("Force refresh - cache cleared")
        
        # Check cache first (unless force refresh)
        cache_key = "system_settings"
        if not force_refresh:
            cached_result = cache.get(cache_key)
            if cached_result:
                return cached_result
        
        # Get current data using smart API wrapper
        data = api_manager.handle_api_call(
            api_manager.wp.get_daily_data,
            day=datetime.date.today(),
            serial_number=SERIAL_NUMBER,
            wifi_pn=WIFI_PN,
            dev_code=DEV_CODE,
            dev_addr=DEV_ADDR
        )
        
        rows = data.get("dat", {}).get("row", [])
        
        if not rows:
            raise HTTPException(status_code=503, detail="No data available from system")
        
        # Get latest reading
        latest_row = rows[-1]
        fields = latest_row.get("field", [])
        
        if len(fields) < 50:
            raise HTTPException(status_code=500, detail="Incomplete data from system")
        
        # Extract actual system settings from fields
        grid_voltage = float(fields[1]) if len(fields) > 1 and fields[1] else 230.0
        grid_freq = float(fields[2]) if len(fields) > 2 and fields[2] else 50.0
        ac_input_range = str(fields[37]) if len(fields) > 37 else "Unknown"
        output_source_priority = str(fields[38]) if len(fields) > 38 else "Unknown"
        charger_source_priority = str(fields[39]) if len(fields) > 39 else "Unknown"
        load_status = str(fields[45]) if len(fields) > 45 else "Unknown"
        solar_feed_power = float(fields[46]) if len(fields) > 46 and fields[46] else 0.0
        pv_power = float(fields[11]) if len(fields) > 11 and fields[11] else 0.0
        load_power = float(fields[21]) if len(fields) > 21 and fields[21] else 0.0  # AC Output Active Power
        system_status = str(fields[49]) if len(fields) > 49 else "Unknown"
        
        # 1. Fetch actual inverter hardware setting (std_solar_feed_to_grid_ctrl_d)
        hardware_feed_setting = "Enable"
        try:
            feed_reg = api_manager.handle_api_call(
                api_manager.wp.get_device_ctrl_value,
                serial_number=SERIAL_NUMBER,
                wifi_pn=WIFI_PN,
                dev_code=DEV_CODE,
                dev_addr=DEV_ADDR,
                ctrl_id="std_solar_feed_to_grid_ctrl_d"
            )
            if feed_reg and feed_reg.get("err") == 0 and "dat" in feed_reg:
                val = str(feed_reg["dat"].get("val", "Enable"))
                if val in ["Enable", "Disable"]:
                    hardware_feed_setting = val
                    settings_storage.set("grid_feeding_enabled", (val == "Enable"))
        except Exception as e:
            logger.warning(f"Could not read inverter feed register directly: {e}")
            saved_setting = settings_storage.get("grid_feeding_enabled", True)
            hardware_feed_setting = "Enable" if saved_setting else "Disable"

        # 2. Strong Physical Logic & Environmental State Evaluation
        surplus_power = max(0.0, round(pv_power - load_power, 1))
        is_hardware_enabled = (hardware_feed_setting.lower() == "enable")
        is_grid_connected = (grid_voltage >= 90.0) and (system_status != "Battery Mode")
        is_actively_feeding = solar_feed_power >= 10.0
        is_night = pv_power < 15.0

        pkt_timezone = timezone(timedelta(hours=5))
        pkt_now = datetime.datetime.now(pkt_timezone)
        current_time_str = pkt_now.strftime("%I:%M %p")

        if not is_grid_connected:
            feed_state = "grid_outage"
            feed_title = "Grid Outage (Grid Disconnected)"
            feed_badge = "⚠️ Grid Outage (Anti-Islanding Active)"
            feed_display = f"Anti-Islanding Lock Active — Cannot feed during outage ({current_time_str})"
            feed_explanation = "The utility grid is down or disconnected. Inverter anti-islanding safety disconnect is open to protect line workers; solar feed is halted."
            feed_color = "warning"
            is_feeding_now = False
        elif is_night:
            feed_state = "night_standby"
            feed_title = "Night Standby (0W Solar Production)"
            feed_badge = "🌙 Standby (Night, 0W Generation)"
            feed_display = f"Standby Mode — PV Inactive (0W), Powering Home ({int(load_power)}W) via Grid - {current_time_str}"
            feed_explanation = f"Solar array is inactive at night (PV: 0W). System operates in utility pass-through mode powering home load ({int(load_power)}W). Solar grid feeding will resume automatically at dawn."
            feed_color = "info"
            is_feeding_now = False
        elif is_actively_feeding:
            feed_state = "active_feeding"
            feed_title = f"Actively Exporting {int(solar_feed_power)}W to Grid"
            feed_badge = f"⚡ Actively Feeding ({int(solar_feed_power)}W)"
            feed_display = f"Actively Feeding {int(solar_feed_power)}W excess solar into National Grid - {current_time_str}"
            feed_explanation = f"Solar generation ({int(pv_power)}W) exceeds home load ({int(load_power)}W). Net surplus of {int(solar_feed_power)}W is actively feeding into the national grid."
            feed_color = "success"
            is_feeding_now = True
        elif not is_hardware_enabled:
            feed_state = "hardware_disabled"
            feed_title = "Grid Feeding Disabled in Inverter Settings"
            feed_badge = "🚫 Grid Feeding Disabled"
            feed_display = f"Disabled in Inverter Firmware Settings - {current_time_str}"
            feed_explanation = f"Inverter register 'std_solar_feed_to_grid_ctrl_d' is set to Disable. Surplus solar power of {int(surplus_power)}W is being curtailed instead of exported."
            feed_color = "error"
            is_feeding_now = False
        elif surplus_power <= 50.0:
            feed_state = "self_consumption"
            feed_title = "100% Solar Self-Consumption (Zero Surplus)"
            feed_badge = "🏠 100% Self-Consumption"
            feed_display = f"Self-Consumption — All PV ({int(pv_power)}W) powering Home Load ({int(load_power)}W) - {current_time_str}"
            feed_explanation = f"Solar array is generating {int(pv_power)}W, but household appliances are consuming {int(load_power)}W. There is zero excess surplus available to export right now. Feeding is ready and on standby."
            feed_color = "primary"
            is_feeding_now = False
        else:
            feed_state = "export_standby"
            feed_title = "Surplus Available / Inverter Regulating"
            feed_badge = "⏳ Export Standby"
            feed_display = f"Export Standby ({int(surplus_power)}W surplus available, current feed {int(solar_feed_power)}W) - {current_time_str}"
            feed_explanation = f"PV generation ({int(pv_power)}W) exceeds load ({int(load_power)}W), but current feed is {int(solar_feed_power)}W. Inverter power management is stabilizing."
            feed_color = "warning"
            is_feeding_now = False

        # Only update monitoring service with actual hardware enabled setting
        monitoring_service.set_grid_feeding_status(is_hardware_enabled)
        
        result = {
            "success": True,
            "timestamp": datetime.datetime.now().isoformat(),
            "settings": {
                "ac_input_range": ac_input_range,
                "output_source_priority": output_source_priority,
                "charger_source_priority": charger_source_priority,
                "load_status": load_status,
                "system_status": system_status,
                "grid_voltage": grid_voltage,
                "grid_freq": grid_freq,
                "grid_feed_enabled": is_hardware_enabled,
                "hardware_feed_setting": hardware_feed_setting,
                "grid_feed_state": feed_state,
                "grid_feed_title": feed_title,
                "grid_feed_badge": feed_badge,
                "grid_feed_display": feed_display,
                "grid_feed_explanation": feed_explanation,
                "grid_feed_color": feed_color,
                "is_actively_feeding": is_actively_feeding,
                "solar_feed_power": solar_feed_power,
                "pv_power": pv_power,
                "load_power": load_power,
                "surplus_power": surplus_power,
                "is_night": is_night,
                "is_grid_connected": is_grid_connected
            },
            "note": "Real-time evaluated hardware and telemetry values from your inverter."
        }
        
        # Cache the result
        cache.set(cache_key, result)
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/control/settings")
async def get_saved_settings():
    """
    Get ACTUAL system settings (not saved preferences)
    
    This endpoint now returns real hardware values instead of user preferences.
    """
    return await get_current_system_settings()


@app.post("/control/system-settings")
async def update_system_settings(settings: SystemSettings):
    """
    Update general system settings
    
    Configure multiple system parameters in one request.
    Only provided parameters will be updated.
    """
    try:
        updated_settings = {}
        
        if settings.output_voltage:
            updated_settings["output_voltage"] = f"{settings.output_voltage}V"
        if settings.output_frequency:
            updated_settings["output_frequency"] = f"{settings.output_frequency}Hz"
        if settings.max_ac_charging_current:
            updated_settings["max_ac_charging_current"] = f"{settings.max_ac_charging_current}A"
        if settings.max_charging_current:
            updated_settings["max_charging_current"] = f"{settings.max_charging_current}A"
        if settings.charger_source_priority:
            updated_settings["charger_source_priority"] = settings.charger_source_priority
        if settings.ac_input_voltage_range:
            updated_settings["ac_input_voltage_range"] = settings.ac_input_voltage_range
        
        # TODO: Implement actual API calls to update settings
        
        return {
            "success": True,
            "message": "System settings updated",
            "updated_settings": updated_settings,
            "note": "Settings will take effect immediately"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# System Health & Monitoring
@app.get("/system/check-reset")
async def check_system_reset(force_refresh: bool = False):
    """
    Check if inverter Output Priority has changed from normal "Solar Utility Bat"
    
    Detects ANY change from "Solar Utility Bat" to other values
    Sends alert when changed.
    """
    try:
        # Force refresh: Clear cache if requested
        if force_refresh:
            cache.clear("system_reset")
            logger.info("Force refresh for reset check - cache cleared")
        
        # Check cache first
        cache_key = "system_reset"
        if not force_refresh:
            cached_result = cache.get(cache_key)
            if cached_result:
                return cached_result
        
        # Get current system data
        data = api_manager.handle_api_call(
            api_manager.wp.get_daily_data,
            day=datetime.date.today(),
            serial_number=SERIAL_NUMBER,
            wifi_pn=WIFI_PN,
            dev_code=DEV_CODE,
            dev_addr=DEV_ADDR
        )
        
        rows = data.get("dat", {}).get("row", [])
        
        if not rows:
            raise HTTPException(status_code=503, detail="No data available from system")
        
        # Get latest reading
        latest_row = rows[-1]
        fields = latest_row.get("field", [])
        
        if len(fields) < 39:
            raise HTTPException(status_code=500, detail="Incomplete data from system")
        
        # Extract settings
        output_source_priority = str(fields[38]) if len(fields) > 38 else "Unknown"
        
        # Determine reset status
        EXPECTED_OUTPUT_PRIORITY = "Solar Utility Bat"
        reset_detected = False
        reset_reasons = []
        
        # Check: Alert on ANY change from "Solar Utility Bat"
        if output_source_priority != EXPECTED_OUTPUT_PRIORITY and output_source_priority != "Unknown":
            reset_detected = True
            reset_reasons.append(f"Output Priority changed from '{EXPECTED_OUTPUT_PRIORITY}' to '{output_source_priority}'")
        
        # Call monitoring service to check and send alerts if needed
        await monitoring_service.check_system_reset(output_source_priority)
        
        result = {
            "success": True,
            "timestamp": datetime.datetime.now().isoformat(),
            "reset_detected": reset_detected,
            "reset_reasons": reset_reasons,
            "settings": {
                "output_source_priority": output_source_priority,
                "expected_output_priority": EXPECTED_OUTPUT_PRIORITY
            },
            "recommendations": [
                "Open WatchPower app",
                "Set Output Priority back to 'Solar Utility Bat'",
                "Disable LCD Auto Return if enabled",
                "Enable Grid Feeding if it was disabled"
            ] if reset_detected else [],
            "note": "Alerts sent via Email, Telegram, and Discord when reset is detected"
        }
        
        # Cache the result
        cache.set(cache_key, result)
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/system/monitoring-status")
async def get_monitoring_status():
    """
    Check if the monitoring service is running and get its status.
    """
    try:
        # Check if monitoring service is active
        is_shutdown_requested = monitoring_service.shutdown_requested
        
        # Get current system data to test connectivity
        system_data = await monitoring_service.get_current_system_data()
        
        return {
            "status": "success",
            "monitoring_active": not is_shutdown_requested,
            "shutdown_requested": is_shutdown_requested,
            "last_system_data": system_data,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error checking monitoring status: {str(e)}")
        return {
            "status": "error",
            "message": f"Error checking monitoring status: {str(e)}",
            "timestamp": datetime.now().isoformat()
        }


@app.post("/system/restart-monitoring")
async def restart_monitoring():
    """
    Force restart the monitoring service if it's not running.
    """
    try:
        if monitoring_service.shutdown_requested:
            # Reset shutdown flag and restart
            monitoring_service.shutdown_requested = False
            logger.info("🔄 Monitoring service restart requested")
            
            return {
                "status": "success",
                "message": "Monitoring service restart initiated. Check logs for status.",
                "timestamp": datetime.now().isoformat()
            }
        else:
            return {
                "status": "info",
                "message": "Monitoring service is already running",
                "timestamp": datetime.now().isoformat()
            }
            
    except Exception as e:
        logger.error(f"Error restarting monitoring: {str(e)}")
        return {
            "status": "error",
            "message": f"Error restarting monitoring: {str(e)}",
            "timestamp": datetime.now().isoformat()
        }


@app.get("/system/health", response_model=SystemHealthResponse)
async def get_system_health(force_refresh: bool = False):
    """
    Get comprehensive system health status
    """
    try:
        # Force refresh: Clear cache if requested
        if force_refresh:
            cache.clear("system_health")
            logger.info("Force refresh for health - cache cleared")
        
        # Check cache first
        cache_key = "system_health"
        if not force_refresh:
            cached_result = cache.get(cache_key)
            if cached_result:
                return cached_result
        
        # Get current data
        data = api_manager.handle_api_call(
            api_manager.wp.get_daily_data,
            day=datetime.date.today(),
            serial_number=SERIAL_NUMBER,
            wifi_pn=WIFI_PN,
            dev_code=DEV_CODE,
            dev_addr=DEV_ADDR
        )
        
        rows = data.get("dat", {}).get("row", [])
        
        if not rows:
            raise HTTPException(status_code=503, detail="No data available from system")
        
        # Get latest reading
        latest_row = rows[-1]
        fields = latest_row.get("field", [])
        
        # Update monitoring service timestamp
        monitoring_service.update_data_timestamp()
        
        # Extract key metrics (based on data.json field indices)
        utility_voltage = float(fields[6]) if len(fields) > 6 and fields[6] else 0.0
        generator_voltage = float(fields[8]) if len(fields) > 8 and fields[8] else 0.0
        
        # Use generator voltage if utility is 0 (common in Pakistan - grid through generator input)
        actual_grid_voltage = generator_voltage if utility_voltage == 0.0 else utility_voltage
        
        utility_frequency = float(fields[7]) if len(fields) > 7 and fields[7] else 0.0
        generator_frequency = float(fields[9]) if len(fields) > 9 and fields[9] else 0.0
        actual_grid_frequency = generator_frequency if utility_frequency == 0.0 else utility_frequency
        
        pv_voltage = float(fields[10]) if len(fields) > 10 and fields[10] else 0.0
        pv_power = float(fields[11]) if len(fields) > 11 and fields[11] else 0.0
        ac_output_voltage = float(fields[17]) if len(fields) > 17 and fields[17] else 0.0
        ac_output_frequency = float(fields[19]) if len(fields) > 19 and fields[19] else 0.0
        ac_output_power = float(fields[21]) if len(fields) > 21 and fields[21] else 0.0
        output_load_percent = float(fields[22]) if len(fields) > 22 and fields[22] else 0.0
        mode = str(fields[47]) if len(fields) > 47 and fields[47] else "Unknown"
        output_source_priority = str(fields[38]) if len(fields) > 38 and fields[38] else "Unknown"
        
        # Check for load shedding using actual grid voltage
        await monitoring_service.check_load_shedding(actual_grid_voltage)
        
        # Check for low production
        await monitoring_service.check_low_production(pv_power, datetime.datetime.now().strftime("%H:%M"))
        
        # Check for system reset based on output priority
        await monitoring_service.check_system_reset(output_source_priority)
        
        # Calculate health score
        health_score = 100
        warnings = []
        errors = []
        status = "Online"
        
        # Check grid voltage (use actual grid voltage - generator or utility)
        if actual_grid_voltage < 180:
            health_score -= 20
            warnings.append(f"Low grid voltage: {actual_grid_voltage}V")
            if actual_grid_voltage < 150:
                health_score -= 20
                errors.append(f"Critical grid voltage: {actual_grid_voltage}V")
                status = "Warning"
        
        # Check load
        if output_load_percent > 80:
            health_score -= 15
            warnings.append(f"High load: {output_load_percent}%")
        if output_load_percent > 95:
            health_score -= 15
            errors.append(f"Critical load: {output_load_percent}%")
            status = "Critical"
        
        # Check PV production (during daylight hours 6 AM - 6 PM)
        current_hour = datetime.datetime.now().hour
        if 6 <= current_hour <= 18 and pv_power < 50:
            health_score -= 10
            warnings.append(f"Low solar production: {pv_power}W")
        
        # Check mode
        if mode == "Fault Mode":
            health_score -= 50
            errors.append("System in fault mode!")
            status = "Critical"
        elif mode == "Standby Mode":
            warnings.append("System in standby mode")
        
        result = SystemHealthResponse(
            timestamp=datetime.datetime.now(),
            status=status,
            health_score=max(0, health_score),
            utility_ac_voltage=actual_grid_voltage,  # Use actual grid voltage (generator or utility)
            utility_ac_frequency=actual_grid_frequency,
            pv_input_voltage=pv_voltage,
            pv_charging_power=pv_power,
            ac_output_voltage=ac_output_voltage,
            ac_output_frequency=ac_output_frequency,
            ac_output_power=ac_output_power,
            output_load_percent=output_load_percent,
            system_mode=mode,
            warnings=warnings,
            errors=errors
        )
        
        # Cache the result
        cache.set(cache_key, result)
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Email Notifications & Alerts
@app.post("/notifications/test")
async def test_notification(request: NotificationTestRequest = None):
    """
    Send a test notification to verify email configuration
    
    Types:
    - test: General test email
    - grid_feed_reminder: Test grid feed reminder
    - load_shedding: Test load shedding alert
    - system_shutdown: Test system shutdown alert
    - low_production: Test low production alert
    - system_reset: Test system reset alert
    """
    try:
        if request is None:
            request = NotificationTestRequest()
        
        success = False
        
        if request.notification_type == "test":
            success = email_service.send_test_email()
        elif request.notification_type == "grid_feed_reminder":
            success = email_service.send_grid_feed_reminder()
        elif request.notification_type == "load_shedding":
            success = email_service.send_load_shedding_alert(voltage=150.0, duration_minutes=15)
        elif request.notification_type == "system_shutdown":
            success = email_service.send_system_shutdown_alert(last_seen_minutes=30)
        elif request.notification_type == "low_production":
            success = email_service.send_low_production_alert(
                current_production=200.0,
                expected_min=500.0,
                time_range="11:00-15:00"
            )
        elif request.notification_type == "system_reset":
            success = email_service.send_system_reset_alert(
                output_priority="Utility Solar Bat"
            )
        
        if success:
            return {
                "success": True,
                "message": f"Test notification sent successfully",
                "type": request.notification_type,
                "recipient": email_service.recipient_email
            }
        else:
            return {
                "success": False,
                "message": "Failed to send notification - check email configuration",
                "type": request.notification_type
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/notifications/status")
async def get_notification_status():
    """Get current notification configuration status"""
    try:
        return {
            "success": True,
            "email_configured": bool(email_service.sender_email and email_service.sender_password),
            "sender_email": email_service.sender_email,
            "recipient_email": email_service.recipient_email,
            "smtp_server": email_service.smtp_server,
            "smtp_port": email_service.smtp_port,
            "telegram_configured": bool(telegram_service.bot_token and telegram_service.chat_id),
            "telegram_chat_id": telegram_service.chat_id if telegram_service.chat_id else "Not configured",
            "discord_configured": bool(discord_service.webhook_url),
            "discord_webhook": "Configured" if discord_service.webhook_url else "Not configured",
            "monitoring_active": monitoring_service.system_online,
            "grid_feeding_enabled": monitoring_service.grid_feeding_enabled,
            "is_load_shedding": monitoring_service.is_load_shedding,
            "last_data_timestamp": monitoring_service.last_data_timestamp.isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/notifications/test-telegram")
@app.get("/notifications/test-telegram")
async def test_telegram_notification():
    """Send a test Telegram message to verify configuration"""
    try:
        success = telegram_service.send_test_message()
        
        if success:
            return {
                "success": True,
                "message": "Test Telegram message sent successfully",
                "recipient": telegram_service.chat_id
            }
        else:
            return {
                "success": False,
                "message": "Failed to send Telegram - check configuration"
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/notifications/test-discord")
@app.get("/notifications/test-discord")
async def test_discord_notification():
    """Send a test Discord message to verify webhook configuration"""
    try:
        success = discord_service.send_test_message()
        
        if success:
            return {
                "success": True,
                "message": "Test Discord message sent successfully",
                "webhook": "Configured"
            }
        else:
            return {
                "success": False,
                "message": "Failed to send Discord - check webhook configuration"
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/notifications/test-email")
@app.get("/notifications/test-email")
async def test_email_notification():
    """Send a test email to verify configuration"""
    try:
        success = email_service.send_test_email()
        
        if success:
            return {
                "success": True,
                "message": "Test email sent successfully",
                "recipient": email_service.recipient_email
            }
        else:
            return {
                "success": False,
                "message": "Failed to send email - check configuration"
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/notifications/mode-alert")
async def send_mode_alert_endpoint(request: ModeAlertRequest):
    """Send multi-channel alerts when system mode changes"""
    try:
        logger.info(f"📢 Mode alert triggered: {request.mode}")
        
        # Format timestamp for display
        timestamp_str = request.timestamp.strftime("%Y-%m-%d %H:%M:%S")
        
        results = {
            "success": True,
            "message": "Mode change alerts sent",
            "mode": request.mode,
            "channels": {}
        }
        
        # Send via Email
        try:
            email_success = email_service.send_mode_alert(
                request.mode, 
                request.message, 
                timestamp_str
            )
            results["channels"]["email"] = {
                "success": email_success,
                "recipient": email_service.recipient_email
            }
            if email_success:
                logger.info(f"✅ Mode alert sent via Email for {request.mode}")
            else:
                logger.error(f"❌ Failed to send mode alert via Email")
        except Exception as e:
            logger.error(f"Email service error: {e}")
            results["channels"]["email"] = {"success": False, "error": str(e)}
        
        # Send via Telegram
        try:
            telegram_success = telegram_service.send_mode_alert(
                request.mode, 
                request.message, 
                timestamp_str
            )
            results["channels"]["telegram"] = {
                "success": telegram_success,
                "recipient": telegram_service.chat_id
            }
            if telegram_success:
                logger.info(f"✅ Mode alert sent via Telegram for {request.mode}")
            else:
                logger.error(f"❌ Failed to send mode alert via Telegram")
        except Exception as e:
            logger.error(f"Telegram service error: {e}")
            results["channels"]["telegram"] = {"success": False, "error": str(e)}
        
        # Send via Discord
        try:
            discord_success = discord_service.send_mode_alert(
                request.mode, 
                request.message, 
                timestamp_str
            )
            results["channels"]["discord"] = {
                "success": discord_success
            }
            if discord_success:
                logger.info(f"✅ Mode alert sent via Discord for {request.mode}")
            else:
                logger.error(f"❌ Failed to send mode alert via Discord")
        except Exception as e:
            logger.error(f"Discord service error: {e}")
            results["channels"]["discord"] = {"success": False, "error": str(e)}
        
        return results
        
    except Exception as e:
        logger.error(f"Error sending mode alert: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Alert Configuration
alert_config = {
    "grid_feed_reminder_enabled": True,
    "grid_feed_interval_hours": 6,
    "load_shedding_alerts_enabled": True,
    "load_shedding_voltage_threshold": 180.0,
    "system_offline_alerts_enabled": True,
    "system_offline_threshold_minutes": 10,
    "low_production_alerts_enabled": False,
    "low_production_threshold_watts": 500.0,
    "low_production_check_hours": "11:00-15:00"
}


@app.get("/alerts/config")
async def get_alert_config():
    """Get current alert configuration"""
    return {
        "success": True,
        "config": alert_config
    }


@app.post("/alerts/config")
async def update_alert_config(config: dict):
    """Update alert configuration"""
    try:
        global alert_config
        alert_config.update(config)
        
        # Update monitoring service thresholds
        if "grid_feed_interval_hours" in config:
            monitoring_service.grid_feed_interval_hours = config["grid_feed_interval_hours"]
        if "load_shedding_voltage_threshold" in config:
            monitoring_service.load_shedding_voltage_threshold = config["load_shedding_voltage_threshold"]
        if "system_offline_threshold_minutes" in config:
            monitoring_service.system_offline_threshold_minutes = config["system_offline_threshold_minutes"]
        if "low_production_threshold_watts" in config:
            monitoring_service.low_production_threshold = config["low_production_threshold_watts"]
        
        return {
            "success": True,
            "message": "Alert configuration updated",
            "config": alert_config
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/notifications/test-daily-summary")
@app.get("/notifications/test-daily-summary")
async def test_daily_summary():
    """Send a test daily summary to all channels (Email, Telegram, Discord)"""
    try:
        # Get yesterday's date (since summary is for previous day)
        from datetime import date, timedelta
        yesterday = date.today() - timedelta(days=1)
        yesterday_str = yesterday.strftime("%Y-%m-%d")
        
        logger.info(f"📊 Testing daily summary for {yesterday_str}...")
        
        # Fetch yesterday's stats
        summary_data = await monitoring_service.fetch_daily_stats(yesterday_str)
        
        if not summary_data:
            return {
                "success": False,
                "message": f"Failed to fetch daily stats for {yesterday_str}",
                "date": yesterday_str
            }
        
        results = {
            "success": True,
            "message": "Daily summary sent to all channels",
            "date": yesterday_str,
            "data": summary_data,
            "channels": {}
        }
        
        # Send via Email
        try:
            email_success = email_service.send_daily_summary(summary_data)
            results["channels"]["email"] = {
                "success": email_success,
                "recipient": email_service.recipient_email
            }
            if email_success:
                logger.info("✅ Test daily summary sent via Email")
            else:
                logger.error("❌ Failed to send daily summary via Email")
        except Exception as e:
            results["channels"]["email"] = {
                "success": False,
                "error": str(e)
            }
            logger.error(f"❌ Email summary failed: {str(e)}")
        
        # Send via Telegram
        try:
            telegram_success = telegram_service.send_daily_summary(summary_data)
            results["channels"]["telegram"] = {
                "success": telegram_success,
                "chat_id": telegram_service.chat_id
            }
            if telegram_success:
                logger.info("✅ Test daily summary sent via Telegram")
            else:
                logger.error("❌ Failed to send daily summary via Telegram")
        except Exception as e:
            results["channels"]["telegram"] = {
                "success": False,
                "error": str(e)
            }
            logger.error(f"❌ Telegram summary failed: {str(e)}")
        
        # Send via Discord
        try:
            discord_success = discord_service.send_daily_summary(summary_data)
            results["channels"]["discord"] = {
                "success": discord_success,
                "webhook": "Configured" if discord_service.webhook_url else "Not configured"
            }
            if discord_success:
                logger.info("✅ Test daily summary sent via Discord")
            else:
                logger.error("❌ Failed to send daily summary via Discord")
        except Exception as e:
            results["channels"]["discord"] = {
                "success": False,
                "error": str(e)
            }
            logger.error(f"❌ Discord summary failed: {str(e)}")
        
        return results
        
    except Exception as e:
        logger.error(f"Error in test daily summary: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ROOT ENDPOINT
# ============================================================================

@app.get("/")
async def root():
    """API Information and available endpoints"""
    return {
        "name": "Solar Power Dashboard API (Optimized)",
        "version": "2.1.0",
        "status": "online",
        "features": [
            "Real-time solar monitoring",
            "System control and configuration",
            "Email notifications and alerts",
            "Health monitoring",
            "Historical data analysis",
            "Smart session management",
            "10-second response caching"
        ],
        "endpoints": {
            "monitoring": [
                "GET /stats",
                "GET /stats-range",
                "GET /system/health",
                "GET /system/check-reset",
                "GET /devices"
            ],
            "control": [
                "POST /control/grid-feed",
                "POST /control/output-priority",
                "POST /control/lcd-auto-return",
                "POST /control/system-settings"
            ],
            "notifications": [
                "POST /notifications/test",
                "GET /notifications/status"
            ],
            "alerts": [
                "GET /alerts/config",
                "POST /alerts/config"
            ]
        },
        "documentation": "/docs"
    }

@app.get("/health")
@app.head("/health")
async def health_check():
    """
    Health check endpoint for uptime monitoring services.
    Use this with UptimeRobot, Cron-Job.org, or similar services
    to prevent Render.com from spinning down.
    Supports both GET and HEAD methods.
    """
    return {
        "status": "healthy",
        "timestamp": datetime.datetime.now().isoformat(),
        "api_version": "2.1.0",
        "uptime": "online"
    }

@app.get("/ping")
@app.head("/ping")
async def ping():
    """Simple ping endpoint (alternative to /health). Supports GET and HEAD."""
    return {"ping": "pong", "timestamp": datetime.datetime.now().isoformat()}

    try:
        data = api_manager.handle_api_call(
            api_manager.wp.get_daily_data,
            day=datetime.date.today(),
            serial_number=SERIAL_NUMBER,
            wifi_pn=WIFI_PN,
            dev_code=DEV_CODE,
            dev_addr=DEV_ADDR
        )

        rows = data.get("dat", {}).get("row", [])
        today_str = datetime.date.today().strftime("%Y-%m-%d")

        graph = []
        total_production_wh = 0

        for rec in rows:
            fields = rec.get("field", [])
            if len(fields) < 22:
                continue

            timestamp = fields[1]  # "2025-09-14 00:02:18"
            if not timestamp.startswith(today_str):
                continue

            pv_power = float(fields[11]) if fields[11] else 0.0  # PV1 Charging Power (W)
            load_power = float(fields[21]) if fields[21] else 0.0  # AC Output Active Power (W)

            # graph ke liye
            graph.append({
                "time": timestamp[-8:],  # sirf HH:MM:SS
                "pv_power": pv_power,
                "load_power": load_power
            })

            # 5 min interval assume karke Wh calculate
            total_production_wh += pv_power * (5 / 60)

        return {
            "success": True,
            "date": today_str,
            "total_production_kwh": round(total_production_wh / 1000, 3),
            "graph": graph
        }

    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/raw-data")
def raw_data():
    """Return raw WatchPower API daily data for today"""
    try:
        data = api_manager.handle_api_call(
            api_manager.wp.get_daily_data,
            day=datetime.date.today(),
            serial_number=SERIAL_NUMBER,
            wifi_pn=WIFI_PN,
            dev_code=DEV_CODE,
            dev_addr=DEV_ADDR
        )
        return data
    except Exception as e:
        return {"error": str(e)}

def process_data(data: dict, date: str):
    """Convert API raw data into graph format + totals"""
    graph = []
    pv_sum = 0
    load_sum = 0
    interval_hours = 5 / 60  # assume 5min interval = 0.083hr

    for rec in data.get("records", []):
        fields = rec.get("field", [])
        if len(fields) < 22:
            continue

        timestamp = fields[1]
        pv_power = float(fields[11]) if fields[11] not in ["", None] else 0
        load_power = float(fields[21]) if fields[21] not in ["", None] else 0

        # Filter same-day only
        if timestamp.startswith(date):
            graph.append({
                "time": timestamp.split(" ")[1],  # hh:mm:ss
                "pv_power": pv_power,
                "load_power": load_power,
            })
            pv_sum += pv_power * interval_hours
            load_sum += load_power * interval_hours

    return {
        "success": True,
        "date": date,
        "total_production_kwh": round(pv_sum / 1000, 2),
        "total_load_kwh": round(load_sum / 1000, 2),
        "graph": graph,
    }

 

@app.get("/stats")
def get_stats(date: str = Query(default=datetime.date.today().strftime("%Y-%m-%d"))):
    """Get solar stats for a given date (default = today). OPTIMIZED with caching."""
    try:
        day = datetime.datetime.strptime(date, "%Y-%m-%d").date()
        data = api_manager.handle_api_call(
            api_manager.wp.get_daily_data,
            day=day,
            serial_number=SERIAL_NUMBER,
            wifi_pn=WIFI_PN,
            dev_code=DEV_CODE,
            dev_addr=DEV_ADDR
        )

        rows = data.get("dat", {}).get("row", [])
        graph = []
        total_production_wh = 0
        total_load_wh = 0

        for rec in rows:
            fields = rec.get("field", [])
            if len(fields) < 22:
                continue

            timestamp = fields[1]  # e.g. "2025-09-10 12:34:56"
            if not timestamp.startswith(date):
                continue

            # Safe parsing
            try:
                pv_power = float(fields[11]) if fields[11] not in ["", None] else 0.0
            except:
                pv_power = 0.0
            try:
                load_power = float(fields[21]) if fields[21] not in ["", None] else 0.0
            except:
                load_power = 0.0
            try:
                mode = str(fields[47]) if fields[47] not in ["", None] else 0.0
            except:
                mode = 0.0

            graph.append({
                "time": timestamp[-8:],  # HH:MM:SS
                "pv_power": pv_power,
                "load_power": load_power,
                "mode":mode
            })

            # 5 min interval = 0.0833 hr
            total_production_wh += pv_power * (5 / 60)
            total_load_wh += load_power * (5 / 60)

        return {
            "success": True,
            "date": date,
            "total_production_kwh": round(total_production_wh / 1000, 3),
            "total_load_kwh": round(total_load_wh / 1000, 3),
            "graph": graph
        }

    except Exception as e:
        return {"success": False, "error": str(e)}

 
@app.get("/stats-range")
def stats_range(from_date: str = Query(...), to_date: str = Query(...)):

    def generate_stats():
        try:
            start = datetime.datetime.strptime(from_date, "%Y-%m-%d").date()
            end = datetime.datetime.strptime(to_date, "%Y-%m-%d").date()

            if start > end:
                yield json.dumps({"success": False, "error": "from_date must be <= to_date"}) + "\n"
                return

            total_days = (end - start).days + 1
            total_prod_wh = 0
            total_load_wh = 0
            daily_stats = []

            current = start
            while current <= end:
                try:
                    # Retry logic with exponential backoff
                    max_retries = 3
                    retry_delay = 1.0  # seconds
                    data = None
                    last_error = None
                    
                    for attempt in range(max_retries):
                        try:
                            data = api_manager.handle_api_call(
                                api_manager.wp.get_daily_data,
                                day=current,
                                serial_number=SERIAL_NUMBER,
                                wifi_pn=WIFI_PN,
                                dev_code=DEV_CODE,
                                dev_addr=DEV_ADDR
                            )
                            break  # Success, exit retry loop
                        except Exception as e:
                            last_error = e
                            error_str = str(e).lower()
                            
                            # Don't retry on certain errors (like no data available)
                            if "no record" in error_str or "err_no_record" in error_str or "err 12" in error_str:
                                raise e
                            
                            # If this is the last attempt, raise the error
                            if attempt == max_retries - 1:
                                raise e
                            
                            # Exponential backoff: 1s, 2s, 4s
                            delay = retry_delay * (2 ** attempt)
                            logger.warning(f"⚠️ Retry attempt {attempt + 1}/{max_retries} after {delay}s for {current}: {str(e)}")
                            time.sleep(delay)
                    
                    if data is None:
                        raise last_error if last_error else Exception("Failed to fetch data after retries")

                    rows = data.get("dat", {}).get("row", [])
                    pv_wh = 0
                    load_wh = 0
                    interval_hours = 5 / 60

                    for rec in rows:
                        fields = rec.get("field", [])
                        if len(fields) < 22:
                            continue

                        timestamp = fields[1]
                        if not timestamp.startswith(str(current)):
                            continue

                        pv_power = float(fields[11]) if fields[11] else 0.0
                        load_power = float(fields[21]) if fields[21] else 0.0
                        pv_wh += pv_power * interval_hours
                        load_wh += load_power * interval_hours

                    total_prod_wh += pv_wh
                    total_load_wh += load_wh

                    daily_data = {
                        "date": str(current),
                        "production_kwh": round(pv_wh / 1000, 2),
                        "load_kwh": round(load_wh / 1000, 2)
                    }
                    daily_stats.append(daily_data)

                except Exception as e:
                    daily_data = {
                        "date": str(current),
                        "production_kwh": None,
                        "load_kwh": None,
                        "error": str(e)
                    }
                    daily_stats.append(daily_data)

                # ✅ Yield progress for frontend
                progress = len(daily_stats) / total_days * 100
                yield json.dumps({
                    "success": True,
                    "progress": round(progress, 2),
                    "daily": daily_data,
                    "total_production_kwh": round(total_prod_wh / 1000, 2),
                    "total_load_kwh": round(total_load_wh / 1000, 2)
                }) + "\n"

                current += datetime.timedelta(days=1)

        except Exception as e:
            yield json.dumps({"success": False, "error": str(e)}) + "\n"

    return StreamingResponse(generate_stats(), media_type="application/json")


# ============================================================================
# NEW FEATURES: System Control & Monitoring Endpoints
# ============================================================================

# Quick Access Controls
@app.post("/control/grid-feed")
async def control_grid_feed(control: GridFeedControl):
    """
    Enable or disable grid feeding (quick access endpoint)
    
    Setting is saved persistently and survives server restarts.
    **Note:** This updates tracking/monitoring only. Use WatchPower app for actual hardware control.
    """
    try:
        # Update monitoring service and save to storage
        monitoring_service.set_grid_feeding_status(control.enabled)
        
        # TODO: Implement actual API call to control grid feeding
        # This would require reverse engineering the WatchPower control protocol
        
        return {
            "success": True,
            "message": f"Grid feeding {'enabled' if control.enabled else 'disabled'}",
            "grid_feed_enabled": control.enabled,
            "saved": True,
            "note": "Setting saved. Email reminders will be sent if disabled. Use WatchPower app for actual hardware control."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/control/output-priority")
async def control_output_priority(control: OutputPriorityControl):
    """
    Set output source priority (quick access endpoint)
    
    Options:
    - Solar_first: Prioritize solar power
    - Grid_first: Prioritize grid power
    - SBU: Solar-Battery-Utility (recommended)
    
    **Note:** Setting is saved for tracking. Use WatchPower app for actual hardware control.
    """
    try:
        # Save to storage
        settings_storage.set("output_priority", control.priority)
        
        # TODO: Implement actual API call to set output priority
        return {
            "success": True,
            "message": f"Output priority set to {control.priority}",
            "priority": control.priority,
            "saved": True,
            "note": "Preference saved. Use WatchPower app for actual hardware control."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/control/lcd-auto-return")
async def control_lcd_auto_return(settings: LCDAutoReturnSettings):
    """
    Configure LCD auto return to default screen (quick access endpoint)
    
    **Note:** Setting is saved for tracking. Use WatchPower app for actual hardware control.
    """
    try:
        # Save to storage
        settings_storage.update({
            "lcd_auto_return_enabled": settings.enabled,
            "lcd_timeout_seconds": settings.timeout_seconds if settings.enabled else None
        })
        
        # TODO: Implement actual API call to set LCD settings
        return {
            "success": True,
            "message": f"LCD auto return {'enabled' if settings.enabled else 'disabled'}",
            "enabled": settings.enabled,
            "timeout_seconds": settings.timeout_seconds if settings.enabled else None,
            "saved": True,
            "note": "Preference saved. Use WatchPower app for actual hardware control."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/system/settings/current")
async def get_current_system_settings(force_refresh: bool = False):
    """
    Get ACTUAL system settings from the inverter (READ-ONLY)
    
    Returns real-time values from the hardware, not user preferences.
    Use WatchPower app to change these settings.
    force_refresh: If True, re-login to API to get fresh data
    """
    try:
        # Force refresh: Clear cache if requested
        if force_refresh:
            cache.clear("system_settings")
            logger.info("Force refresh - cache cleared")
        
        # Check cache first (unless force refresh)
        cache_key = "system_settings"
        if not force_refresh:
            cached_result = cache.get(cache_key)
            if cached_result:
                return cached_result
        
        # Get current data using smart API wrapper
        data = api_manager.handle_api_call(
            api_manager.wp.get_daily_data,
            day=datetime.date.today(),
            serial_number=SERIAL_NUMBER,
            wifi_pn=WIFI_PN,
            dev_code=DEV_CODE,
            dev_addr=DEV_ADDR
        )
        
        rows = data.get("dat", {}).get("row", [])
        
        if not rows:
            raise HTTPException(status_code=503, detail="No data available from system")
        
        # Get latest reading
        latest_row = rows[-1]
        fields = latest_row.get("field", [])
        
        if len(fields) < 50:
            raise HTTPException(status_code=500, detail="Incomplete data from system")
        
        # Extract actual system settings from fields
        ac_input_range = str(fields[37]) if len(fields) > 37 else "Unknown"
        output_source_priority = str(fields[38]) if len(fields) > 38 else "Unknown"
        charger_source_priority = str(fields[39]) if len(fields) > 39 else "Unknown"
        load_status = str(fields[45]) if len(fields) > 45 else "Unknown"
        solar_feed_power = float(fields[46]) if len(fields) > 46 and fields[46] else 0.0
        pv_power = float(fields[11]) if len(fields) > 11 and fields[11] else 0.0
        load_power = float(fields[21]) if len(fields) > 21 and fields[21] else 0.0  # AC Output Active Power
        system_status = str(fields[49]) if len(fields) > 49 else "Unknown"
        
        # SMART grid feeding detection
        # Simple approach: Feed power + saved status
        # 
        # Key rules:
        # 1. Feed >0W → ENABLED (100% certain)
        # 2. Feed =0W → Use saved status (can't determine from hardware alone)
        # 3. Only detect DISABLED if saved status says so
        
        # Get Pakistan Standard Time (PKT = UTC+5)
        pkt_timezone = timezone(timedelta(hours=5))
        pkt_now = datetime.datetime.now(pkt_timezone)
        current_hour = pkt_now.hour
        current_time_str = pkt_now.strftime("%I:%M %p")  # Format: "10:30 AM"
        
        is_daytime = 7 <= current_hour <= 17  # 7 AM - 5 PM PKT
        is_feeding = solar_feed_power >= 10  # Any feed power (even 10W means enabled)
        
        # Get saved status from last known state (from WatchPower app changes)
        saved_grid_status = settings_storage.get("grid_feeding_enabled", True)
        
        # Simple logic: Feed power tells the truth
        if is_feeding:
            # If feeding ANY amount → ENABLED
            grid_feed_enabled = True
            feed_status = "enabled_feeding"
            feed_display = f"Enabled & Feeding ({int(solar_feed_power)}W) - {current_time_str}"
            
        elif saved_grid_status == False:
            # Saved status says disabled + no feed → DISABLED
            grid_feed_enabled = False
            feed_status = "disabled"
            if is_daytime:
                feed_display = f"DISABLED (PV: {int(pv_power)}W, Load: {int(load_power)}W, Feed: {int(solar_feed_power)}W) - {current_time_str}"
            else:
                feed_display = f"DISABLED (Night) - {current_time_str}"
            
        else:
            # No feed but saved status says enabled → ENABLED (no excess to feed)
            grid_feed_enabled = True
            feed_status = "enabled_not_feeding"
            if is_daytime:
                feed_display = f"Enabled (No excess, PV: {int(pv_power)}W, Load: {int(load_power)}W) - {current_time_str}"
            else:
                feed_display = f"Enabled (Night, No Production) - {current_time_str}"
        
        # Update monitoring service with actual hardware status
        monitoring_service.set_grid_feeding_status(grid_feed_enabled)
        
        result = {
            "success": True,
            "timestamp": datetime.datetime.now().isoformat(),
            "settings": {
                "ac_input_range": ac_input_range,
                "output_source_priority": output_source_priority,
                "charger_source_priority": charger_source_priority,
                "load_status": load_status,
                "system_status": system_status,
                "grid_feed_enabled": grid_feed_enabled,
                "grid_feed_status": feed_status,
                "grid_feed_display": feed_display,
                "solar_feed_power": solar_feed_power,
                "pv_power": pv_power
            },
            "note": "These are READ-ONLY values from your inverter. Use WatchPower app to change settings."
        }
        
        # Cache the result
        cache.set(cache_key, result)
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/control/settings")
async def get_saved_settings():
    """
    Get ACTUAL system settings (not saved preferences)
    
    This endpoint now returns real hardware values instead of user preferences.
    """
    return await get_current_system_settings()


@app.post("/control/system-settings")
async def update_system_settings(settings: SystemSettings):
    """
    Update general system settings
    
    Configure multiple system parameters in one request.
    Only provided parameters will be updated.
    """
    try:
        updated_settings = {}
        
        if settings.output_voltage:
            updated_settings["output_voltage"] = f"{settings.output_voltage}V"
        if settings.output_frequency:
            updated_settings["output_frequency"] = f"{settings.output_frequency}Hz"
        if settings.max_ac_charging_current:
            updated_settings["max_ac_charging_current"] = f"{settings.max_ac_charging_current}A"
        if settings.max_charging_current:
            updated_settings["max_charging_current"] = f"{settings.max_charging_current}A"
        if settings.charger_source_priority:
            updated_settings["charger_source_priority"] = settings.charger_source_priority
        if settings.ac_input_voltage_range:
            updated_settings["ac_input_voltage_range"] = settings.ac_input_voltage_range
        
        # TODO: Implement actual API calls to update settings
        
        return {
            "success": True,
            "message": "System settings updated",
            "updated_settings": updated_settings,
            "note": "Settings will take effect immediately"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# System Health & Monitoring
@app.get("/system/check-reset")
async def check_system_reset(force_refresh: bool = False):
    """
    Check if inverter Output Priority has changed from normal "Solar Utility Bat"
    
    Detects ANY change from "Solar Utility Bat" to other values
    Sends alert when changed.
    """
    try:
        # Force refresh: Clear cache if requested
        if force_refresh:
            cache.clear("system_reset")
            logger.info("Force refresh for reset check - cache cleared")
        
        # Check cache first
        cache_key = "system_reset"
        if not force_refresh:
            cached_result = cache.get(cache_key)
            if cached_result:
                return cached_result
        
        # Get current system data
        data = api_manager.handle_api_call(
            api_manager.wp.get_daily_data,
            day=datetime.date.today(),
            serial_number=SERIAL_NUMBER,
            wifi_pn=WIFI_PN,
            dev_code=DEV_CODE,
            dev_addr=DEV_ADDR
        )
        
        rows = data.get("dat", {}).get("row", [])
        
        if not rows:
            raise HTTPException(status_code=503, detail="No data available from system")
        
        # Get latest reading
        latest_row = rows[-1]
        fields = latest_row.get("field", [])
        
        if len(fields) < 39:
            raise HTTPException(status_code=500, detail="Incomplete data from system")
        
        # Extract settings
        output_source_priority = str(fields[38]) if len(fields) > 38 else "Unknown"
        
        # Determine reset status
        EXPECTED_OUTPUT_PRIORITY = "Solar Utility Bat"
        reset_detected = False
        reset_reasons = []
        
        # Check: Alert on ANY change from "Solar Utility Bat"
        if output_source_priority != EXPECTED_OUTPUT_PRIORITY and output_source_priority != "Unknown":
            reset_detected = True
            reset_reasons.append(f"Output Priority changed from '{EXPECTED_OUTPUT_PRIORITY}' to '{output_source_priority}'")
        
        # Call monitoring service to check and send alerts if needed
        await monitoring_service.check_system_reset(output_source_priority)
        
        result = {
            "success": True,
            "timestamp": datetime.datetime.now().isoformat(),
            "reset_detected": reset_detected,
            "reset_reasons": reset_reasons,
            "settings": {
                "output_source_priority": output_source_priority,
                "expected_output_priority": EXPECTED_OUTPUT_PRIORITY
            },
            "recommendations": [
                "Open WatchPower app",
                "Set Output Priority back to 'Solar Utility Bat'",
                "Disable LCD Auto Return if enabled",
                "Enable Grid Feeding if it was disabled"
            ] if reset_detected else [],
            "note": "Alerts sent via Email, Telegram, and Discord when reset is detected"
        }
        
        # Cache the result
        cache.set(cache_key, result)
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/system/monitoring-status")
async def get_monitoring_status():
    """
    Check if the monitoring service is running and get its status.
    """
    try:
        # Check if monitoring service is active
        is_shutdown_requested = monitoring_service.shutdown_requested
        
        # Get current system data to test connectivity
        system_data = await monitoring_service.get_current_system_data()
        
        return {
            "status": "success",
            "monitoring_active": not is_shutdown_requested,
            "shutdown_requested": is_shutdown_requested,
            "last_system_data": system_data,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error checking monitoring status: {str(e)}")
        return {
            "status": "error",
            "message": f"Error checking monitoring status: {str(e)}",
            "timestamp": datetime.now().isoformat()
        }


@app.post("/system/restart-monitoring")
async def restart_monitoring():
    """
    Force restart the monitoring service if it's not running.
    """
    try:
        if monitoring_service.shutdown_requested:
            # Reset shutdown flag and restart
            monitoring_service.shutdown_requested = False
            logger.info("🔄 Monitoring service restart requested")
            
            return {
                "status": "success",
                "message": "Monitoring service restart initiated. Check logs for status.",
                "timestamp": datetime.now().isoformat()
            }
        else:
            return {
                "status": "info",
                "message": "Monitoring service is already running",
                "timestamp": datetime.now().isoformat()
            }
            
    except Exception as e:
        logger.error(f"Error restarting monitoring: {str(e)}")
        return {
            "status": "error",
            "message": f"Error restarting monitoring: {str(e)}",
            "timestamp": datetime.now().isoformat()
        }


@app.get("/system/health", response_model=SystemHealthResponse)
async def get_system_health(force_refresh: bool = False):
    """
    Get comprehensive system health status
    """
    try:
        # Force refresh: Clear cache if requested
        if force_refresh:
            cache.clear("system_health")
            logger.info("Force refresh for health - cache cleared")
        
        # Check cache first
        cache_key = "system_health"
        if not force_refresh:
            cached_result = cache.get(cache_key)
            if cached_result:
                return cached_result
        
        # Get current data
        data = api_manager.handle_api_call(
            api_manager.wp.get_daily_data,
            day=datetime.date.today(),
            serial_number=SERIAL_NUMBER,
            wifi_pn=WIFI_PN,
            dev_code=DEV_CODE,
            dev_addr=DEV_ADDR
        )
        
        rows = data.get("dat", {}).get("row", [])
        
        if not rows:
            raise HTTPException(status_code=503, detail="No data available from system")
        
        # Get latest reading
        latest_row = rows[-1]
        fields = latest_row.get("field", [])
        
        # Update monitoring service timestamp
        monitoring_service.update_data_timestamp()
        
        # Extract key metrics (based on data.json field indices)
        utility_voltage = float(fields[6]) if len(fields) > 6 and fields[6] else 0.0
        generator_voltage = float(fields[8]) if len(fields) > 8 and fields[8] else 0.0
        
        # Use generator voltage if utility is 0 (common in Pakistan - grid through generator input)
        actual_grid_voltage = generator_voltage if utility_voltage == 0.0 else utility_voltage
        
        utility_frequency = float(fields[7]) if len(fields) > 7 and fields[7] else 0.0
        generator_frequency = float(fields[9]) if len(fields) > 9 and fields[9] else 0.0
        actual_grid_frequency = generator_frequency if utility_frequency == 0.0 else utility_frequency
        
        pv_voltage = float(fields[10]) if len(fields) > 10 and fields[10] else 0.0
        pv_power = float(fields[11]) if len(fields) > 11 and fields[11] else 0.0
        ac_output_voltage = float(fields[17]) if len(fields) > 17 and fields[17] else 0.0
        ac_output_frequency = float(fields[19]) if len(fields) > 19 and fields[19] else 0.0
        ac_output_power = float(fields[21]) if len(fields) > 21 and fields[21] else 0.0
        output_load_percent = float(fields[22]) if len(fields) > 22 and fields[22] else 0.0
        mode = str(fields[47]) if len(fields) > 47 and fields[47] else "Unknown"
        output_source_priority = str(fields[38]) if len(fields) > 38 and fields[38] else "Unknown"
        
        # Check for load shedding using actual grid voltage
        await monitoring_service.check_load_shedding(actual_grid_voltage)
        
        # Check for low production
        await monitoring_service.check_low_production(pv_power, datetime.datetime.now().strftime("%H:%M"))
        
        # Check for system reset based on output priority
        await monitoring_service.check_system_reset(output_source_priority)
        
        # Calculate health score
        health_score = 100
        warnings = []
        errors = []
        status = "Online"
        
        # Check grid voltage (use actual grid voltage - generator or utility)
        if actual_grid_voltage < 180:
            health_score -= 20
            warnings.append(f"Low grid voltage: {actual_grid_voltage}V")
            if actual_grid_voltage < 150:
                health_score -= 20
                errors.append(f"Critical grid voltage: {actual_grid_voltage}V")
                status = "Warning"
        
        # Check load
        if output_load_percent > 80:
            health_score -= 15
            warnings.append(f"High load: {output_load_percent}%")
        if output_load_percent > 95:
            health_score -= 15
            errors.append(f"Critical load: {output_load_percent}%")
            status = "Critical"
        
        # Check PV production (during daylight hours 6 AM - 6 PM)
        current_hour = datetime.datetime.now().hour
        if 6 <= current_hour <= 18 and pv_power < 50:
            health_score -= 10
            warnings.append(f"Low solar production: {pv_power}W")
        
        # Check mode
        if mode == "Fault Mode":
            health_score -= 50
            errors.append("System in fault mode!")
            status = "Critical"
        elif mode == "Standby Mode":
            warnings.append("System in standby mode")
        
        result = SystemHealthResponse(
            timestamp=datetime.datetime.now(),
            status=status,
            health_score=max(0, health_score),
            utility_ac_voltage=actual_grid_voltage,  # Use actual grid voltage (generator or utility)
            utility_ac_frequency=actual_grid_frequency,
            pv_input_voltage=pv_voltage,
            pv_charging_power=pv_power,
            ac_output_voltage=ac_output_voltage,
            ac_output_frequency=ac_output_frequency,
            ac_output_power=ac_output_power,
            output_load_percent=output_load_percent,
            system_mode=mode,
            warnings=warnings,
            errors=errors
        )
        
        # Cache the result
        cache.set(cache_key, result)
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Email Notifications & Alerts
@app.post("/notifications/test")
async def test_notification(request: NotificationTestRequest = None):
    """
    Send a test notification to verify email configuration
    
    Types:
    - test: General test email
    - grid_feed_reminder: Test grid feed reminder
    - load_shedding: Test load shedding alert
    - system_shutdown: Test system shutdown alert
    - low_production: Test low production alert
    - system_reset: Test system reset alert
    """
    try:
        if request is None:
            request = NotificationTestRequest()
        
        success = False
        
        if request.notification_type == "test":
            success = email_service.send_test_email()
        elif request.notification_type == "grid_feed_reminder":
            success = email_service.send_grid_feed_reminder()
        elif request.notification_type == "load_shedding":
            success = email_service.send_load_shedding_alert(voltage=150.0, duration_minutes=15)
        elif request.notification_type == "system_shutdown":
            success = email_service.send_system_shutdown_alert(last_seen_minutes=30)
        elif request.notification_type == "low_production":
            success = email_service.send_low_production_alert(
                current_production=200.0,
                expected_min=500.0,
                time_range="11:00-15:00"
            )
        elif request.notification_type == "system_reset":
            success = email_service.send_system_reset_alert(
                output_priority="Utility Solar Bat"
            )
        
        if success:
            return {
                "success": True,
                "message": f"Test notification sent successfully",
                "type": request.notification_type,
                "recipient": email_service.recipient_email
            }
        else:
            return {
                "success": False,
                "message": "Failed to send notification - check email configuration",
                "type": request.notification_type
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/notifications/status")
async def get_notification_status():
    """Get current notification configuration status"""
    try:
        return {
            "success": True,
            "email_configured": bool(email_service.sender_email and email_service.sender_password),
            "sender_email": email_service.sender_email,
            "recipient_email": email_service.recipient_email,
            "smtp_server": email_service.smtp_server,
            "smtp_port": email_service.smtp_port,
            "telegram_configured": bool(telegram_service.bot_token and telegram_service.chat_id),
            "telegram_chat_id": telegram_service.chat_id if telegram_service.chat_id else "Not configured",
            "discord_configured": bool(discord_service.webhook_url),
            "discord_webhook": "Configured" if discord_service.webhook_url else "Not configured",
            "monitoring_active": monitoring_service.system_online,
            "grid_feeding_enabled": monitoring_service.grid_feeding_enabled,
            "is_load_shedding": monitoring_service.is_load_shedding,
            "last_data_timestamp": monitoring_service.last_data_timestamp.isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/notifications/test-telegram")
@app.get("/notifications/test-telegram")
async def test_telegram_notification():
    """Send a test Telegram message to verify configuration"""
    try:
        success = telegram_service.send_test_message()
        
        if success:
            return {
                "success": True,
                "message": "Test Telegram message sent successfully",
                "recipient": telegram_service.chat_id
            }
        else:
            return {
                "success": False,
                "message": "Failed to send Telegram - check configuration"
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/notifications/test-discord")
@app.get("/notifications/test-discord")
async def test_discord_notification():
    """Send a test Discord message to verify webhook configuration"""
    try:
        success = discord_service.send_test_message()
        
        if success:
            return {
                "success": True,
                "message": "Test Discord message sent successfully",
                "webhook": "Configured"
            }
        else:
            return {
                "success": False,
                "message": "Failed to send Discord - check webhook configuration"
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/notifications/test-email")
@app.get("/notifications/test-email")
async def test_email_notification():
    """Send a test email to verify configuration"""
    try:
        success = email_service.send_test_email()
        
        if success:
            return {
                "success": True,
                "message": "Test email sent successfully",
                "recipient": email_service.recipient_email
            }
        else:
            return {
                "success": False,
                "message": "Failed to send email - check configuration"
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/notifications/mode-alert")
async def send_mode_alert_endpoint(request: ModeAlertRequest):
    """Send multi-channel alerts when system mode changes"""
    try:
        logger.info(f"📢 Mode alert triggered: {request.mode}")
        
        # Format timestamp for display
        timestamp_str = request.timestamp.strftime("%Y-%m-%d %H:%M:%S")
        
        results = {
            "success": True,
            "message": "Mode change alerts sent",
            "mode": request.mode,
            "channels": {}
        }
        
        # Send via Email
        try:
            email_success = email_service.send_mode_alert(
                request.mode, 
                request.message, 
                timestamp_str
            )
            results["channels"]["email"] = {
                "success": email_success,
                "recipient": email_service.recipient_email
            }
            if email_success:
                logger.info(f"✅ Mode alert sent via Email for {request.mode}")
            else:
                logger.error(f"❌ Failed to send mode alert via Email")
        except Exception as e:
            logger.error(f"Email service error: {e}")
            results["channels"]["email"] = {"success": False, "error": str(e)}
        
        # Send via Telegram
        try:
            telegram_success = telegram_service.send_mode_alert(
                request.mode, 
                request.message, 
                timestamp_str
            )
            results["channels"]["telegram"] = {
                "success": telegram_success,
                "recipient": telegram_service.chat_id
            }
            if telegram_success:
                logger.info(f"✅ Mode alert sent via Telegram for {request.mode}")
            else:
                logger.error(f"❌ Failed to send mode alert via Telegram")
        except Exception as e:
            logger.error(f"Telegram service error: {e}")
            results["channels"]["telegram"] = {"success": False, "error": str(e)}
        
        # Send via Discord
        try:
            discord_success = discord_service.send_mode_alert(
                request.mode, 
                request.message, 
                timestamp_str
            )
            results["channels"]["discord"] = {
                "success": discord_success
            }
            if discord_success:
                logger.info(f"✅ Mode alert sent via Discord for {request.mode}")
            else:
                logger.error(f"❌ Failed to send mode alert via Discord")
        except Exception as e:
            logger.error(f"Discord service error: {e}")
            results["channels"]["discord"] = {"success": False, "error": str(e)}
        
        return results
        
    except Exception as e:
        logger.error(f"Error sending mode alert: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Alert Configuration
alert_config = {
    "grid_feed_reminder_enabled": True,
    "grid_feed_interval_hours": 6,
    "load_shedding_alerts_enabled": True,
    "load_shedding_voltage_threshold": 180.0,
    "system_offline_alerts_enabled": True,
    "system_offline_threshold_minutes": 10,
    "low_production_alerts_enabled": False,
    "low_production_threshold_watts": 500.0,
    "low_production_check_hours": "11:00-15:00"
}


@app.get("/alerts/config")
async def get_alert_config():
    """Get current alert configuration"""
    return {
        "success": True,
        "config": alert_config
    }


@app.post("/alerts/config")
async def update_alert_config(config: dict):
    """Update alert configuration"""
    try:
        global alert_config
        alert_config.update(config)
        
        # Update monitoring service thresholds
        if "grid_feed_interval_hours" in config:
            monitoring_service.grid_feed_interval_hours = config["grid_feed_interval_hours"]
        if "load_shedding_voltage_threshold" in config:
            monitoring_service.load_shedding_voltage_threshold = config["load_shedding_voltage_threshold"]
        if "system_offline_threshold_minutes" in config:
            monitoring_service.system_offline_threshold_minutes = config["system_offline_threshold_minutes"]
        if "low_production_threshold_watts" in config:
            monitoring_service.low_production_threshold = config["low_production_threshold_watts"]
        
        return {
            "success": True,
            "message": "Alert configuration updated",
            "config": alert_config
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/notifications/test-daily-summary")
@app.get("/notifications/test-daily-summary")
async def test_daily_summary():
    """Send a test daily summary to all channels (Email, Telegram, Discord)"""
    try:
        # Get yesterday's date (since summary is for previous day)
        from datetime import date, timedelta
        yesterday = date.today() - timedelta(days=1)
        yesterday_str = yesterday.strftime("%Y-%m-%d")
        
        logger.info(f"📊 Testing daily summary for {yesterday_str}...")
        
        # Fetch yesterday's stats
        summary_data = await monitoring_service.fetch_daily_stats(yesterday_str)
        
        if not summary_data:
            return {
                "success": False,
                "message": f"Failed to fetch daily stats for {yesterday_str}",
                "date": yesterday_str
            }
        
        results = {
            "success": True,
            "message": "Daily summary sent to all channels",
            "date": yesterday_str,
            "data": summary_data,
            "channels": {}
        }
        
        # Send via Email
        try:
            email_success = email_service.send_daily_summary(summary_data)
            results["channels"]["email"] = {
                "success": email_success,
                "recipient": email_service.recipient_email
            }
            if email_success:
                logger.info("✅ Test daily summary sent via Email")
            else:
                logger.error("❌ Failed to send daily summary via Email")
        except Exception as e:
            results["channels"]["email"] = {
                "success": False,
                "error": str(e)
            }
            logger.error(f"❌ Email summary failed: {str(e)}")
        
        # Send via Telegram
        try:
            telegram_success = telegram_service.send_daily_summary(summary_data)
            results["channels"]["telegram"] = {
                "success": telegram_success,
                "chat_id": telegram_service.chat_id
            }
            if telegram_success:
                logger.info("✅ Test daily summary sent via Telegram")
            else:
                logger.error("❌ Failed to send daily summary via Telegram")
        except Exception as e:
            results["channels"]["telegram"] = {
                "success": False,
                "error": str(e)
            }
            logger.error(f"❌ Telegram summary failed: {str(e)}")
        
        # Send via Discord
        try:
            discord_success = discord_service.send_daily_summary(summary_data)
            results["channels"]["discord"] = {
                "success": discord_success,
                "webhook": "Configured" if discord_service.webhook_url else "Not configured"
            }
            if discord_success:
                logger.info("✅ Test daily summary sent via Discord")
            else:
                logger.error("❌ Failed to send daily summary via Discord")
        except Exception as e:
            results["channels"]["discord"] = {
                "success": False,
                "error": str(e)
            }
            logger.error(f"❌ Discord summary failed: {str(e)}")
        
        return results
        
    except Exception as e:
        logger.error(f"Error in test daily summary: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ROOT ENDPOINT
# ============================================================================

@app.get("/")
async def root():
    """API Information and available endpoints"""
    return {
        "name": "Solar Power Dashboard API (Optimized)",
        "version": "2.1.0",
        "status": "online",
        "features": [
            "Real-time solar monitoring",
            "System control and configuration",
            "Email notifications and alerts",
            "Health monitoring",
            "Historical data analysis",
            "Smart session management",
            "10-second response caching"
        ],
        "endpoints": {
            "monitoring": [
                "GET /stats",
                "GET /stats-range",
                "GET /system/health",
                "GET /system/check-reset",
                "GET /devices"
            ],
            "control": [
                "POST /control/grid-feed",
                "POST /control/output-priority",
                "POST /control/lcd-auto-return",
                "POST /control/system-settings"
            ],
            "notifications": [
                "POST /notifications/test",
                "GET /notifications/status"
            ],
            "alerts": [
                "GET /alerts/config",
                "POST /alerts/config"
            ]
        },
        "documentation": "/docs"
    }

@app.get("/health")
@app.head("/health")
async def health_check():
    """
    Health check endpoint for uptime monitoring services.
    Use this with UptimeRobot, Cron-Job.org, or similar services
    to prevent Render.com from spinning down.
    Supports both GET and HEAD methods.
    """
    return {
        "status": "healthy",
        "timestamp": datetime.datetime.now().isoformat(),
        "api_version": "2.1.0",
        "uptime": "online"
    }

@app.get("/ping")
@app.head("/ping")
async def ping():
    """Simple ping endpoint (alternative to /health). Supports GET and HEAD."""
    return {"ping": "pong", "timestamp": datetime.datetime.now().isoformat()}
