from datetime import date
import time
from typing import Any, Optional
import requests
import hashlib

from watchpower_api.models import DeviceIdentifier

__version__ = "0.3.0"


class WatchPowerAPI:
    _BASE_URL: str = "http://android.shinemonitor.com/public/"
    _SUFFIX_CONTEXT: str = "&i18n=pt_BR&lang=pt_BR&source=1&_app_client_=android&_app_id_=wifiapp.volfw.watchpower&_app_version_=1.0.6.3"
    _COMPANY_KEY: str = "bnrl_frRFjEz8Mkn"

    def __init__(self) -> None:
        # auth
        self.token: Optional[str] = None
        self.secret: Optional[str] = None  # Fixed: should be None initially
        self.expire: Optional[str] = None

    @staticmethod
    def _generate_salt() -> str:
        return str(round(time.time() * 1000))

    @staticmethod
    def _sha1_str_lower_case(byte_array: bytes) -> str:
        sha1_hash = hashlib.sha1(byte_array).hexdigest()  # nosec
        return sha1_hash.lower()

    def _hash(self, *args: str) -> str:
        arg_concat = ""
        for arg in args:
            arg_concat = arg_concat + arg
        return self._sha1_str_lower_case(bytes(arg_concat, encoding="utf-8"))

    def _ensure_logged_in(self) -> tuple[str, str]:
        if self.token is None or self.secret is None:
            raise RuntimeError(
                "Must login first using .login(USERNAMES, password) method"
            )
        return self.token, self.secret

    def login(self, username: str, password: str) -> "WatchPowerAPI":  # Fixed parameter name
        """Authenticates against the API and stores relevant auth artifacts for follow-up requests using this instance

        Args:
            username (str): username of the account you created in the WatchPower application
            password (str): Password of the account you created in the WatchPower application

        Raises:
            RuntimeError: If any API error occurs

        Returns:
            Self: same instance, with stored auth artifacts
        """
        base_action = (
            f"&action=authSource&usr={username}&company-key={self._COMPANY_KEY}"
            + self._SUFFIX_CONTEXT
        )

        salt = self._generate_salt()

        password_hash = self._hash(password)

        # Fixed: Correct order for sign generation
        sign = self._hash(salt, password_hash, base_action)

        url = self._BASE_URL + f"?sign={sign}&salt={salt}" + base_action

        print(f"Debug - Login URL: {url}")  # Debug line

        response = requests.get(url, timeout=100)

        response_data: dict[str, Any] = response.json()

        if response.status_code == 200:
            error_code: int = response_data["err"]
            if error_code == 0:
                print("Login successful!")
                self.secret = response_data["dat"]["secret"]
                self.token = response_data["dat"]["token"]
                self.expire = response_data["dat"]["expire"]
                return self
            else:
                raise RuntimeError(f"API Error {error_code}: {response_data.get('desc', 'Unknown error')}")
        raise RuntimeError(f"HTTP Error {response.status_code}: {response.text}")

    # Rest of your methods remain the same...
    def get_daily_data(
        self,
        day: date,
        serial_number: str,
        wifi_pn: str,
        dev_code: int,
        dev_addr: int,
    ) -> dict[str, Any]:
        """Get inverter daily data"""
        token, secret = self._ensure_logged_in()
        _date = day.isoformat()
        base_action = (
            f"&action=queryDeviceDataOneDay&pn={wifi_pn}&devcode={dev_code}&sn={serial_number}&devaddr={dev_addr}&date={_date}"
            + self._SUFFIX_CONTEXT
        )
        salt = self._generate_salt()
        sign = self._hash(salt, secret, token, base_action)
        auth = f"?sign={sign}&salt={salt}&token={self.token}"
        url = self._BASE_URL + auth + base_action
        response = requests.get(url, timeout=10)

        if response.status_code == 200:
            response_data: dict[str, Any] = response.json()
            error_code: int = response_data["err"]
            if error_code == 0:
                return response_data
            raise RuntimeError(response_data)
        raise RuntimeError(response.status_code)

    def get_devices(self) -> list[DeviceIdentifier]:
        """Get user connected devices"""
        token, secret = self._ensure_logged_in()
        base_action = "&action=webQueryDeviceEs" + self._SUFFIX_CONTEXT
        salt = self._generate_salt()
        sign = self._hash(salt, secret, token, base_action)
        auth = f"?sign={sign}&salt={salt}&token={self.token}"
        url = self._BASE_URL + auth + base_action
        response = requests.get(url, timeout=10)

        if response.status_code == 200:
            response_data: dict[str, Any] = response.json()
            error_code: int = response_data["err"]
            if error_code == 0:
                return [
                    DeviceIdentifier(**data) for data in response_data["dat"]["device"]
                ]
            raise RuntimeError(response_data)
        raise RuntimeError(response.status_code)

    def get_device_daily_data(
        self,
        device_identifier: DeviceIdentifier,
        day: date,
    ) -> dict[str, Any]:
        """Get inverter daily data"""
        return self.get_daily_data(
            day=day,
            serial_number=device_identifier.serial_number,
            wifi_pn=device_identifier.wifi_pin,
            dev_code=device_identifier.device_code,
            dev_addr=device_identifier.device_address,
        )

    def get_device_last_data(
        self,
        serial_number: str,
        wifi_pn: str,
        dev_code: int,
        dev_addr: int,
    ) -> dict[str, Any]:
        """Get inverter REAL-TIME / LATEST data (not historical)
        
        This endpoint returns the most recent data point from the device,
        which updates more frequently than the daily historical data.
        """
        token, secret = self._ensure_logged_in()
        base_action = (
            f"&action=queryDeviceLastData&pn={wifi_pn}&devcode={dev_code}&sn={serial_number}&devaddr={dev_addr}"
            + self._SUFFIX_CONTEXT
        )
        salt = self._generate_salt()
        sign = self._hash(salt, secret, token, base_action)
        auth = f"?sign={sign}&salt={salt}&token={self.token}"
        url = self._BASE_URL + auth + base_action
        response = requests.get(url, timeout=10)

        if response.status_code == 200:
            response_data: dict[str, Any] = response.json()
            error_code: int = response_data["err"]
            if error_code == 0:
                return response_data
            raise RuntimeError(response_data)
        raise RuntimeError(response.status_code)

    def get_device_status(
        self,
        serial_number: str,
        wifi_pn: str,
        dev_code: int,
        dev_addr: int,
    ) -> dict[str, Any]:
        """Get inverter REAL-TIME STATUS (instant updates)
        
        Per ShineMonitor API docs section 1.6.14 - Query device status
        This should update more frequently than queryDeviceLastData
        """
        token, secret = self._ensure_logged_in()
        base_action = (
            f"&action=queryDeviceStatus&pn={wifi_pn}&devcode={dev_code}&sn={serial_number}&devaddr={dev_addr}"
            + self._SUFFIX_CONTEXT
        )
        salt = self._generate_salt()
        sign = self._hash(salt, secret, token, base_action)
        auth = f"?sign={sign}&salt={salt}&token={self.token}"
        url = self._BASE_URL + auth + base_action
        response = requests.get(url, timeout=10)

        if response.status_code == 200:
            response_data: dict[str, Any] = response.json()
            error_code: int = response_data["err"]
            if error_code == 0:
                return response_data
            raise RuntimeError(response_data)
        raise RuntimeError(response.status_code)

    def get_device_realtime_data(
        self,
        serial_number: str,
        wifi_pn: str,
        dev_code: int,
        dev_addr: int,
    ) -> dict[str, Any]:
        """Get inverter LATEST RAW DATA (section 1.6.6)
        
        Per ShineMonitor API docs - Query device's latest raw data
        This might be the fastest updating endpoint
        """
        token, secret = self._ensure_logged_in()
        base_action = (
            f"&action=queryDeviceRealTimeData&pn={wifi_pn}&devcode={dev_code}&sn={serial_number}&devaddr={dev_addr}"
            + self._SUFFIX_CONTEXT
        )
        salt = self._generate_salt()
        sign = self._hash(salt, secret, token, base_action)
        auth = f"?sign={sign}&salt={salt}&token={self.token}"
        url = self._BASE_URL + auth + base_action
        response = requests.get(url, timeout=10)

        if response.status_code == 200:
            response_data: dict[str, Any] = response.json()
            error_code: int = response_data["err"]
            if error_code == 0:
                return response_data
            raise RuntimeError(response_data)
        raise RuntimeError(response.status_code)

    def get_collector_info(self, wifi_pn: str) -> dict[str, Any]:
        """Get data collector/logger information
        
        Returns collector info including datFetch (upload interval)
        Per ShineMonitor API docs section 1.5.3
        """
        token, secret = self._ensure_logged_in()
        base_action = (
            f"&action=queryCollectorInfo&pn={wifi_pn}"
            + self._SUFFIX_CONTEXT
        )
        salt = self._generate_salt()
        sign = self._hash(salt, secret, token, base_action)
        auth = f"?sign={sign}&salt={salt}&token={self.token}"
        url = self._BASE_URL + auth + base_action
        response = requests.get(url, timeout=10)

        if response.status_code == 200:
            response_data: dict[str, Any] = response.json()
            error_code: int = response_data["err"]
            if error_code == 0:
                return response_data
            raise RuntimeError(response_data)
        raise RuntimeError(response.status_code)

    def get_device_info(
        self,
        serial_number: str,
        wifi_pn: str,
        dev_code: int,
        dev_addr: int,
    ) -> dict[str, Any]:
        """Query device information (Section 1.6.3)
        
        This returns device info and might be cached/updated differently than daily data
        """
        token, secret = self._ensure_logged_in()
        base_action = (
            f"&action=queryDeviceInfo&pn={wifi_pn}&devcode={dev_code}&sn={serial_number}&devaddr={dev_addr}"
            + self._SUFFIX_CONTEXT
        )
        salt = self._generate_salt()
        sign = self._hash(salt, secret, token, base_action)
        auth = f"?sign={sign}&salt={salt}&token={self.token}"
        url = self._BASE_URL + auth + base_action
        response = requests.get(url, timeout=10)

        if response.status_code == 200:
            response_data: dict[str, Any] = response.json()
            error_code: int = response_data["err"]
            if error_code == 0:
                return response_data
            raise RuntimeError(response_data)
        raise RuntimeError(response.status_code)
    
    def get_device_raw_data(
        self,
        serial_number: str,
        wifi_pn: str,
        dev_code: int,
        dev_addr: int,
    ) -> dict[str, Any]:
        """Query device latest RAW data (Section 1.6.6)
        
        Returns the most recent raw data from device
        This might be updated more frequently or differently cached
        """
        token, secret = self._ensure_logged_in()
        base_action = (
            f"&action=queryDeviceRawData&pn={wifi_pn}&devcode={dev_code}&sn={serial_number}&devaddr={dev_addr}"
            + self._SUFFIX_CONTEXT
        )
        salt = self._generate_salt()
        sign = self._hash(salt, secret, token, base_action)
        auth = f"?sign={sign}&salt={salt}&token={self.token}"
        url = self._BASE_URL + auth + base_action
        response = requests.get(url, timeout=10)

        if response.status_code == 200:
            response_data: dict[str, Any] = response.json()
            error_code: int = response_data["err"]
            if error_code == 0:
                return response_data
            raise RuntimeError(response_data)
        raise RuntimeError(response.status_code)

    def get_device_ctrl_value(
        self,
        serial_number: str,
        wifi_pn: str,
        dev_code: int,
        dev_addr: int,
        ctrl_id: str,
    ) -> dict[str, Any]:
        """Query inverter hardware control register value (e.g. std_solar_feed_to_grid_ctrl_d)"""
        token, secret = self._ensure_logged_in()
        base_action = (
            f"&action=queryDeviceCtrlValue&pn={wifi_pn}&devcode={dev_code}&sn={serial_number}&devaddr={dev_addr}&id={ctrl_id}"
            + self._SUFFIX_CONTEXT
        )
        salt = self._generate_salt()
        sign = self._hash(salt, secret, token, base_action)
        auth = f"?sign={sign}&salt={salt}&token={self.token}"
        url = self._BASE_URL + auth + base_action
        response = requests.get(url, timeout=10)

        if response.status_code == 200:
            response_data: dict[str, Any] = response.json()
            error_code: int = response_data["err"]
            if error_code == 0:
                return response_data
            raise RuntimeError(response_data)
        raise RuntimeError(response.status_code)

    def get_device_ctrl_fields(
        self,
        serial_number: str,
        wifi_pn: str,
        dev_code: int,
        dev_addr: int,
    ) -> dict[str, Any]:
        """Query all supported hardware control fields for this inverter model"""
        token, secret = self._ensure_logged_in()
        base_action = (
            f"&action=queryDeviceCtrlField&pn={wifi_pn}&devcode={dev_code}&sn={serial_number}&devaddr={dev_addr}"
            + self._SUFFIX_CONTEXT
        )
        salt = self._generate_salt()
        sign = self._hash(salt, secret, token, base_action)
        auth = f"?sign={sign}&salt={salt}&token={self.token}"
        url = self._BASE_URL + auth + base_action
        response = requests.get(url, timeout=10)

        if response.status_code == 200:
            response_data: dict[str, Any] = response.json()
            error_code: int = response_data["err"]
            if error_code == 0:
                return response_data
            raise RuntimeError(response_data)
        raise RuntimeError(response.status_code)

    def get_device_warnings(
        self,
        serial_number: str,
        wifi_pn: str,
        dev_code: int,
        dev_addr: int,
        page: int = 0,
        pagesize: int = 50,
    ) -> dict[str, Any]:
        """Query inverter hardware warning and alarm logs (line fails, PV loss, fault codes)"""
        token, secret = self._ensure_logged_in()
        base_action = (
            f"&action=queryDeviceWarning&pn={wifi_pn}&devcode={dev_code}&sn={serial_number}&devaddr={dev_addr}&page={page}&pagesize={pagesize}"
            + self._SUFFIX_CONTEXT
        )
        salt = self._generate_salt()
        sign = self._hash(salt, secret, token, base_action)
        auth = f"?sign={sign}&salt={salt}&token={self.token}"
        url = self._BASE_URL + auth + base_action
        response = requests.get(url, timeout=10)

        if response.status_code == 200:
            response_data: dict[str, Any] = response.json()
            error_code: int = response_data["err"]
            if error_code == 0:
                return response_data
            raise RuntimeError(response_data)
        raise RuntimeError(response.status_code)

    def get_plant_info(self, plant_id: int = 5220419) -> dict[str, Any]:
        """Query plant metadata, location, timezone, and environmental calculation parameters"""
        token, secret = self._ensure_logged_in()
        base_action = f"&action=queryPlantInfo&plantid={plant_id}" + self._SUFFIX_CONTEXT
        salt = self._generate_salt()
        sign = self._hash(salt, secret, token, base_action)
        auth = f"?sign={sign}&salt={salt}&token={self.token}"
        url = self._BASE_URL + auth + base_action
        response = requests.get(url, timeout=10)

        if response.status_code == 200:
            response_data: dict[str, Any] = response.json()
            error_code: int = response_data["err"]
            if error_code == 0:
                return response_data
            raise RuntimeError(response_data)
        raise RuntimeError(response.status_code)

    def get_plant_profit(self) -> dict[str, Any]:
        """Query plant environmental offset (CO2, coal saved) and revenue parameters"""
        token, secret = self._ensure_logged_in()
        base_action = "&action=queryPlantsProfit" + self._SUFFIX_CONTEXT
        salt = self._generate_salt()
        sign = self._hash(salt, secret, token, base_action)
        auth = f"?sign={sign}&salt={salt}&token={self.token}"
        url = self._BASE_URL + auth + base_action
        response = requests.get(url, timeout=10)

        if response.status_code == 200:
            response_data: dict[str, Any] = response.json()
            error_code: int = response_data["err"]
            if error_code == 0:
                return response_data
            raise RuntimeError(response_data)
        raise RuntimeError(response.status_code)