import React, { useEffect, useState } from "react";
import axios from "axios";
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    Legend,
    ReferenceArea,
    ReferenceDot
} from "recharts";
import {
    Box,
    Card,
    CardContent,
    Grid,
    Paper,
    InputAdornment,
    TextField,
    LinearProgress,
    Fade,
    Chip,
    Tooltip,
    IconButton,
    Button,
    Typography,
    Alert,
    useTheme,
    useMediaQuery
} from "@mui/material";
import {
    SolarPower as SolarIcon,
    CalendarToday,
    Refresh,
    TrendingUp,
    BatteryChargingFull,
    PowerOff,
    ChevronLeft,
    ChevronRight,
    Fullscreen,
    FullscreenExit,
    PlayArrow,
    Pause,
    Today as TodayIcon,
    CheckCircle,
    Warning
} from "@mui/icons-material";
import { toast } from "react-toastify";
import { API_ENDPOINTS, CONFIG } from "../constants";

const DailyStats = ({ darkMode, themeColor, themeColors }) => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    const [data, setData] = useState([]);
    const [total, setTotal] = useState(0);
    const [loadTotal, setLoadTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [modeZones, setModeZones] = useState([]);
    const [lastUpdated, setLastUpdated] = useState(new Date());
    const [loadSheddingHours, setLoadSheddingHours] = useState(0);
    const [cutOffHours, setcutOffHours] = useState(0);
    const [missingDataHours, setMissingDataHours] = useState(0);
    const [expectedDataPoints, setExpectedDataPoints] = useState(CONFIG.EXPECTED_DATA_POINTS_PER_DAY);
    const [missingDataGaps, setMissingDataGaps] = useState([]);
    const [isLiveMode, setIsLiveMode] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isError, setisError] = useState("");
    const [gridFeedEnabled, setGridFeedEnabled] = useState(null);
    const [isLoadingGridStatus, setIsLoadingGridStatus] = useState(true);
    const [maxPvPoint, setMaxPvPoint] = useState(null);

    const getTodayLocal = () => {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, "0");
        const day = String(today.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    };

    const [selectedDate, setSelectedDate] = useState(getTodayLocal());

    const getModeColor = (mode) => {
        return mode === "Line Mode"
            ? "rgba(76, 175, 80, 0.2)"
            : mode === "Battery Mode"
                ? "rgba(244, 67, 54, 0.2)"
                : mode === "Standby Mode"
                    ? "rgba(255, 152, 0, 0.2)"
                    : "rgba(158, 158, 158, 0.2)";
    };

    const processModeZones = (graphData) => {
        const zones = [];
        let currentMode = null;
        let startIndex = 0;

        graphData.forEach((point, index) => {
            if (point.mode !== currentMode) {
                if (currentMode !== null) {
                    zones.push({
                        start: startIndex,
                        end: index - 1,
                        mode: currentMode
                    });
                }
                currentMode = point.mode;
                startIndex = index;
            }
        });

        if (currentMode !== null) {
            zones.push({
                start: startIndex,
                end: graphData.length - 1,
                mode: currentMode
            });
        }

        return zones;
    };

    const fetchData = async (date) => {
        try {
            const res = await axios.get(API_ENDPOINTS.getDailyStats(date));
            
            console.log('res: ', res);
            if (res.data.success) {

                const graphData = res.data.graph;

                let pvSum = 0;
                let loadSum = 0;
                const intervalHours = CONFIG.DATA_INTERVAL_MINUTES / 60;


                let batteryHours = 0;
                let cutOffHours = 0;
                let maxPv = null;

                graphData.forEach((point) => {
                    pvSum += point.pv_power * intervalHours;
                    loadSum += point.load_power * intervalHours;

                    if (point.pv_power > 0 && (!maxPv || point.pv_power > maxPv.pv_power)) {
                        maxPv = point;
                    }

                    if (point.mode === "Battery Mode") {
                        batteryHours += intervalHours;
                    }
                    const isOff = point.mode === "Standby Mode" || 
                                  point.mode === "Fault Mode" || 
                                  point.mode === "Shutdown Mode" || 
                                  point.mode === "Power Off" || 
                                  point.mode === "Off";
                    if (isOff) {
                        cutOffHours += intervalHours;
                    }
                });

                // Calculate missing data gaps and durations
                const gaps = [];
                const today = getTodayLocal();
                const isToday = date === today;

                if (graphData && graphData.length > 1) {
                    const timeToSeconds = (t) => {
                        if (!t) return 0;
                        const [h, m, s = 0] = t.split(':').map(Number);
                        return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
                    };

                    for (let i = 1; i < graphData.length; i++) {
                        const prevTime = graphData[i - 1].time;
                        const currTime = graphData[i].time;
                        
                        const prevSeconds = timeToSeconds(prevTime);
                        const currSeconds = timeToSeconds(currTime);
                        const diffSeconds = currSeconds - prevSeconds;
                        const diffMinutes = diffSeconds / 60;
                        
                        // Normal interval is 5 min (300s). Jitter up to 6.5 min (390s) is normal.
                        // Any gap > 6.5 minutes indicates missing data / downtime.
                        if (diffMinutes > 6.5) {
                            gaps.push({
                                start: prevTime,
                                end: currTime,
                                duration: Math.round(diffMinutes)
                            });
                        }
                    }
                }

                // Total offline duration calculated from all actual gaps
                const totalGapMinutes = gaps.reduce((sum, g) => sum + g.duration, 0);
                const missingHours = totalGapMinutes / 60;

                setData(graphData);
                setTotal((pvSum / 1000).toFixed(2));
                setLoadTotal((loadSum / 1000).toFixed(2));
                setModeZones(processModeZones(graphData));
                setLastUpdated(new Date());
                setMissingDataGaps(gaps);
                setLoadSheddingHours(batteryHours.toFixed(2));
                setcutOffHours(cutOffHours.toFixed(2));
                setMissingDataHours(missingHours.toFixed(2));
                setExpectedDataPoints(expectedDataPoints);
                setMaxPvPoint(maxPv);

            } else {
                setisError(res.data.error.err)
                toast.error("Error fetching API")
                setData([]);
                setTotal(0);
                setLoadTotal(0);
                setModeZones([]);
                setMissingDataHours(0);
                setMaxPvPoint(null);
            }
        } catch (err) {
            toast.error("Error fetching API")
            setisError(err.msg)
            console.error("Error fetching API:", err);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchGridFeedStatus = async () => {
        try {
            const response = await axios.get(API_ENDPOINTS.systemSettings());
            if (response.data.success) {
                setGridFeedEnabled(response.data.settings.grid_feed_enabled);
            }
            setIsLoadingGridStatus(false);
        } catch (error) {
            console.error('Error fetching grid feed status:', error);
            setIsLoadingGridStatus(false);
        }
    };

    useEffect(() => {
        const fetchAndSetLoading = async () => {
            setIsLoading(true);
            await fetchData(selectedDate);
        };
        fetchAndSetLoading();
        fetchGridFeedStatus(); // Fetch grid feed status

        let interval;
        if (isLiveMode) {
            interval = setInterval(() => {
                fetchData(selectedDate);
                fetchGridFeedStatus(); // Also refresh grid status
            }, CONFIG.AUTO_REFRESH_INTERVAL);
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [selectedDate, isLiveMode]);

    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            const currentData = payload[0].payload;
            const modeColor = currentData.mode === "Line Mode"
                ? "#4caf50"
                : currentData.mode === "Battery Mode"
                    ? "#f44336"
                    : "#ff9800";

            return (
                <Paper 
                    elevation={12} 
                    sx={{ 
                        p: 2.5, 
                        backgroundColor: "rgba(255, 255, 255, 0.98)",
                        backdropFilter: 'blur(10px)',
                        borderRadius: 3,
                        border: '1px solid rgba(0, 0, 0, 0.1)',
                        minWidth: 200
                    }}
                >
                    <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600, mb: 1.5, color: '#333' }}>
                        ⏰ {label}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <Box sx={{ 
                            width: 12, 
                            height: 12, 
                            borderRadius: '50%', 
                            backgroundColor: '#82ca9d',
                            mr: 1.5
                        }} />
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            PV: <span style={{ color: '#82ca9d', fontWeight: 700 }}>{currentData.pv_power} W</span>
                    </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
                        <Box sx={{ 
                            width: 12, 
                            height: 12, 
                            borderRadius: '50%', 
                            backgroundColor: '#8884d8',
                            mr: 1.5
                        }} />
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            Load: <span style={{ color: '#8884d8', fontWeight: 700 }}>{currentData.load_power} W</span>
                    </Typography>
                    </Box>
                    <Box sx={{ 
                        pt: 1.5, 
                        borderTop: '1px solid rgba(0, 0, 0, 0.1)',
                        display: 'flex',
                        alignItems: 'center'
                    }}>
                        <Box sx={{ 
                            width: 8, 
                            height: 8, 
                            borderRadius: '50%', 
                            backgroundColor: modeColor,
                            mr: 1.5
                        }} />
                        <Typography variant="body2" sx={{ color: modeColor, fontWeight: 700 }}>
                            {currentData.mode === "Line Mode" ? "⚡ Connected" :
                                currentData.mode === "Battery Mode" ? "🔋 Disconnected" :
                                    currentData.mode === "Standby Mode" ? "⏸️ System off" : "❓ Out of range"}
                    </Typography>
                    </Box>
                    {(() => {
                        const borderingGap = missingDataGaps.find(g => g.start === label || g.end === label);
                        if (!borderingGap) return null;
                        return (
                            <Box sx={{ 
                                mt: 1.5, 
                                pt: 1, 
                                borderTop: '1px dashed rgba(244, 67, 54, 0.4)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.8
                            }}>
                                <PowerOff sx={{ fontSize: 15, color: '#f44336' }} />
                                <Typography variant="caption" sx={{ color: '#d32f2f', fontWeight: 600 }}>
                                    {borderingGap.start === label ? 'System went offline after this' : 'System recovered here'} ({formatMissingDuration(borderingGap.duration)})
                                </Typography>
                            </Box>
                        );
                    })()}
                </Paper>
            );
        }
        return null;
    };

    const handleRefresh = () => {
        setIsLoading(true);
        setIsLoadingGridStatus(true);
        fetchData(selectedDate);
        fetchGridFeedStatus();
    };
    
    const handlePreviousDay = () => {
        const currentDate = new Date(selectedDate);
        currentDate.setDate(currentDate.getDate() - 1);
        const newDate = currentDate.toISOString().split('T')[0];
        setSelectedDate(newDate);
    };

    const handleNextDay = () => {
        const currentDate = new Date(selectedDate);
        const today = getTodayLocal();
        
        if (selectedDate < today) {
            currentDate.setDate(currentDate.getDate() + 1);
            const newDate = currentDate.toISOString().split('T')[0];
            setSelectedDate(newDate);
        }
    };
    
    const handleTodayClick = () => {
        setSelectedDate(getTodayLocal());
    };
    
    const handleFullscreenToggle = () => {
        setIsFullscreen(!isFullscreen);
    };
    
    const formatHours = (decimalHours) => {
        const totalMinutes = Math.round((Number(decimalHours) || 0) * 60);
        const hrs = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        return `${hrs} hr ${mins} min`;
    };
    
    const formatMissingDuration = (minutes) => {
        const totalMins = Math.round(Number(minutes) || 0);
        if (totalMins >= 60) {
            const hours = Math.floor(totalMins / 60);
            const mins = totalMins % 60;
            if (mins === 0) {
                return `${hours} hr`;
            }
            return `${hours} hr ${mins} min`;
        }
        return `${totalMins} min`;
    };

    const formatCompactDuration = (minutes) => {
        const totalMins = Math.round(Number(minutes) || 0);
        if (totalMins >= 60) {
            const hours = Math.floor(totalMins / 60);
            const mins = totalMins % 60;
            return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
        }
        return `${totalMins}m`;
    };

    const CustomGapLabel = (props) => {
        const { viewBox, gap, index, isMobile, darkMode } = props;
        if (!viewBox) return null;
        
        const x = viewBox.x ?? 0;
        const y = viewBox.y ?? 0;
        const width = viewBox.width ?? 0;
        
        if (isNaN(x) || isNaN(y)) return null;

        const centerX = x + Math.max(width, 0) / 2;
        
        // Stagger vertically across 3 tiers to avoid overlapping adjacent labels on small screens
        const tier = index % 3;
        const badgeHeight = isMobile ? 18 : 20;
        const badgeY = y + 8 + (tier * (badgeHeight + 5));
        
        const text = isMobile 
            ? `⚠️ ${formatCompactDuration(gap.duration)}` 
            : `⚠️ ${formatMissingDuration(gap.duration)} off`;
            
        const charWidth = isMobile ? 6.2 : 7.2;
        const badgeWidth = Math.max(text.length * charWidth + 12, isMobile ? 42 : 58);
        
        return (
            <g style={{ pointerEvents: 'none' }}>
                <rect
                    x={centerX - badgeWidth / 2}
                    y={badgeY}
                    width={badgeWidth}
                    height={badgeHeight}
                    rx={4}
                    ry={4}
                    fill={darkMode ? "rgba(35, 35, 35, 0.95)" : "rgba(255, 255, 255, 0.95)"}
                    stroke="#f44336"
                    strokeWidth={1.2}
                />
                <text
                    x={centerX}
                    y={badgeY + (badgeHeight / 2) + (isMobile ? 3 : 4)}
                    textAnchor="middle"
                    fill={darkMode ? "#ff8a80" : "#d32f2f"}
                    fontSize={isMobile ? 9.5 : 11}
                    fontWeight="700"
                    fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                >
                    {text}
                </text>
            </g>
        );
    };

    const CustomMaxPointLabel = (props) => {
        const { viewBox, maxPoint, isMobile, darkMode } = props;
        if (!viewBox || !maxPoint) return null;
        const x = viewBox.x ?? 0;
        const y = viewBox.y ?? 0;
        if (isNaN(x) || isNaN(y)) return null;

        const text = isMobile 
            ? `⚡ Peak: ${maxPoint.pv_power}W` 
            : `⚡ Peak: ${maxPoint.pv_power}W (${maxPoint.time.slice(0, 5)})`;
            
        const charWidth = isMobile ? 6.2 : 7.2;
        const pillWidth = Math.max(text.length * charWidth + 14, isMobile ? 48 : 66);
        const pillHeight = isMobile ? 18 : 20;
        const pillY = y - pillHeight - 8;

        return (
            <g style={{ pointerEvents: 'none' }}>
                <rect
                    x={x - pillWidth / 2}
                    y={pillY}
                    width={pillWidth}
                    height={pillHeight}
                    rx={4}
                    ry={4}
                    fill={darkMode ? "rgba(25, 45, 25, 0.95)" : "rgba(240, 255, 240, 0.95)"}
                    stroke="#4caf50"
                    strokeWidth={1.2}
                    filter="drop-shadow(0px 1px 3px rgba(0,0,0,0.15))"
                />
                <text
                    x={x}
                    y={pillY + (pillHeight / 2) + (isMobile ? 3 : 4)}
                    textAnchor="middle"
                    fill={darkMode ? "#a5d6a7" : "#2e7d32"}
                    fontSize={isMobile ? 9.5 : 11}
                    fontWeight="700"
                    fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                >
                    {text}
                </text>
            </g>
        );
    };
    
    const currentTheme = themeColors[themeColor];

    return (
        <Box>
            <Grid container spacing={{ xs: 2, sm: 2, md: 3 }} sx={{ mb: { xs: 2, sm: 3 } }}>
                <Grid item xs={12} sm={6} md={6} lg={3} sx={{ display: 'flex' }}>
                    <Fade in timeout={500} style={{ width: '100%' }}>
                        <Card 
                            className="stat-card"
                            sx={{
                                width: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                                color: "white",
                                borderRadius: 4,
                                boxShadow: "0 10px 40px rgba(102, 126, 234, 0.3)",
                                transition: "all 0.3s ease",
                                "&:hover": {
                                    transform: "translateY(-8px)",
                                    boxShadow: "0 15px 50px rgba(102, 126, 234, 0.4)",
                                }
                            }}
                        >
                            <CardContent sx={{ p: { xs: 2, sm: 2.5, md: 3 } }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                                    <Typography variant="body2" sx={{ 
                                        opacity: 0.9, 
                                        textTransform: 'uppercase', 
                                        letterSpacing: 1,
                                        fontSize: { xs: '0.75rem', sm: '0.875rem' }
                                    }}>
                                Solar Production
                            </Typography>
                                    <SolarIcon sx={{ fontSize: { xs: 28, sm: 32 }, opacity: 0.8 }} />
                                </Box>
                                <Typography variant="h3" sx={{ 
                                    fontWeight: 700, 
                                    mb: 1,
                                    fontSize: { xs: '2rem', sm: '2.5rem', md: '3rem' }
                                }}>
                                    {isLoading ? "..." : `${total}`}
                            </Typography>
                                <Typography variant="h6" sx={{ 
                                    opacity: 0.9,
                                    fontSize: { xs: '1rem', sm: '1.25rem' }
                                }}>
                                    kWh
                                </Typography>
                                <Typography variant="body2" sx={{ 
                                    opacity: 0.8, 
                                    mt: 1,
                                    fontSize: { xs: '0.75rem', sm: '0.875rem' }
                                }}>
                                Total PV Production
                            </Typography>
                            {!isLoading && maxPvPoint && maxPvPoint.pv_power > 0 && (
                                <Box sx={{ 
                                    mt: 2, 
                                    pt: 1.5, 
                                    borderTop: '2px solid rgba(255, 255, 255, 0.2)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 0.5
                                }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Typography variant="body2" sx={{ opacity: 0.85, fontWeight: 500, fontSize: { xs: '0.75rem', sm: '0.8rem' } }}>
                                            ⚡ Peak Power:
                                        </Typography>
                                        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: { xs: '0.8rem', sm: '0.875rem' } }}>
                                            {maxPvPoint.pv_power} W
                                        </Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Typography variant="body2" sx={{ opacity: 0.85, fontWeight: 500, fontSize: { xs: '0.75rem', sm: '0.8rem' } }}>
                                            ⏰ Peak Time:
                                        </Typography>
                                        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: { xs: '0.8rem', sm: '0.875rem' } }}>
                                            {maxPvPoint.time.slice(0, 5)}
                                        </Typography>
                                    </Box>
                                </Box>
                            )}
                        </CardContent>
                    </Card>
                    </Fade>
                </Grid>
                <Grid item xs={12} sm={6} md={6} lg={3} sx={{ display: 'flex' }}>
                    <Fade in timeout={700} style={{ width: '100%' }}>
                        <Card 
                            className="stat-card"
                            sx={{
                                width: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                background: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
                                color: "white",
                                borderRadius: 4,
                                boxShadow: "0 10px 40px rgba(240, 147, 251, 0.3)",
                                transition: "all 0.3s ease",
                                "&:hover": {
                                    transform: "translateY(-8px)",
                                    boxShadow: "0 15px 50px rgba(240, 147, 251, 0.4)",
                                }
                            }}
                        >
                            <CardContent sx={{ p: { xs: 2, sm: 2.5, md: 3 } }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                                    <Typography variant="body2" sx={{ 
                                    opacity: 0.9, 
                                    textTransform: 'uppercase', 
                                    letterSpacing: 1,
                                    fontSize: { xs: '0.75rem', sm: '0.875rem' }
                                }}>
                                Energy Usage
                            </Typography>
                                    <TrendingUp sx={{ fontSize: { xs: 28, sm: 32 }, opacity: 0.8 }} />
                                </Box>
                                <Typography variant="h3" sx={{ 
                                    fontWeight: 700, 
                                    mb: 1,
                                    fontSize: { xs: '2rem', sm: '2.5rem', md: '3rem' }
                                }}>
                                    {isLoading ? "..." : `${loadTotal}`}
                            </Typography>
                                <Typography variant="h6" sx={{ 
                                    opacity: 0.9,
                                    fontSize: { xs: '1rem', sm: '1.25rem' }
                                }}>
                                    kWh
                                </Typography>
                                <Typography variant="body2" sx={{ 
                                    opacity: 0.8, 
                                    mt: 1,
                                    fontSize: { xs: '0.75rem', sm: '0.875rem' }
                                }}>
                                Total Load Consumption
                            </Typography>
                        </CardContent>
                    </Card>
                    </Fade>
                </Grid>
                <Grid item xs={12} sm={6} md={6} lg={3} sx={{ display: 'flex' }}>
                    <Fade in timeout={900} style={{ width: '100%' }}>
                        <Card 
                            className="stat-card"
                            sx={{
                                width: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                background: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
                                color: "white",
                                borderRadius: 4,
                                boxShadow: "0 10px 40px rgba(79, 172, 254, 0.3)",
                                transition: "all 0.3s ease",
                                "&:hover": {
                                    transform: "translateY(-8px)",
                                    boxShadow: "0 15px 50px rgba(79, 172, 254, 0.4)",
                                }
                            }}
                        >
                            <CardContent sx={{ p: { xs: 2, sm: 2.5, md: 3 } }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                                    <Typography variant="body2" sx={{ 
                                        opacity: 0.9, 
                                        textTransform: 'uppercase', 
                                        letterSpacing: 1,
                                        fontSize: { xs: '0.75rem', sm: '0.875rem' }
                                    }}>
                                        Grid Contribution
                            </Typography>
                                    <BatteryChargingFull sx={{ fontSize: { xs: 28, sm: 32 }, opacity: 0.8 }} />
                                </Box>
                                <Typography variant="h3" sx={{ 
                                    fontWeight: 700, 
                                    mb: 1,
                                    fontSize: { xs: '2rem', sm: '2.5rem', md: '3rem' }
                                }}>
                                    {isLoading ? "..." : `${(total - loadTotal).toFixed(2)}`}
                            </Typography>
                                <Typography variant="h6" sx={{ 
                                    opacity: 0.9,
                                    fontSize: { xs: '1rem', sm: '1.25rem' }
                                }}>
                                    kWh
                                </Typography>
                                <Typography variant="body2" sx={{ 
                                    opacity: 0.8, 
                                    mt: 1,
                                    fontSize: { xs: '0.75rem', sm: '0.875rem' }
                                }}>
                                    Energy Fed to Grid
                            </Typography>
                        </CardContent>
                    </Card>
                    </Fade>
                </Grid>
                <Grid item xs={12} sm={6} md={6} lg={3} sx={{ display: 'flex' }}>
                    <Fade in timeout={1100} style={{ width: '100%' }}>
                        <Card 
                            className="stat-card"
                            sx={{
                                width: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                background: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
                                color: "white",
                                borderRadius: 4,
                                boxShadow: "0 10px 40px rgba(250, 112, 154, 0.3)",
                                transition: "all 0.3s ease",
                                "&:hover": {
                                    transform: "translateY(-8px)",
                                    boxShadow: "0 15px 50px rgba(250, 112, 154, 0.4)",
                                }
                            }}
                        >
                            <CardContent sx={{ p: { xs: 2, sm: 2.5, md: 3 } }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                                    <Typography variant="body2" sx={{ 
                                        opacity: 0.9, 
                                        textTransform: 'uppercase', 
                                        letterSpacing: 1,
                                        fontSize: { xs: '0.75rem', sm: '0.875rem' }
                                    }}>
                                        Load Shedding
                            </Typography>
                                    <PowerOff sx={{ fontSize: { xs: 28, sm: 32 }, opacity: 0.8 }} />
                                </Box>
                                <Typography variant="h3" sx={{ 
                                    fontWeight: 700, 
                                    mb: 1,
                                    fontSize: { xs: '2rem', sm: '2.5rem', md: '3rem' }
                                }}>
                                {isLoading ? "..." : formatHours(loadSheddingHours)}
                            </Typography>
                                <Typography variant="body2" sx={{ 
                                    opacity: 0.8, 
                                    mt: 1,
                                    fontSize: { xs: '0.75rem', sm: '0.875rem' }
                                }}>
                                    Battery/Solar Runtime
                            </Typography>
                        </CardContent>
                    </Card>
                    </Fade>
                </Grid>
                <Grid item xs={12} sm={12} md={6} sx={{ display: 'flex' }}>
                    <Fade in timeout={1300} style={{ width: '100%' }}>
                        <Card 
                            className="stat-card"
                            sx={{
                                width: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                background: "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
                                color: "#333",
                                borderRadius: 4,
                                boxShadow: "0 10px 40px rgba(168, 237, 234, 0.3)",
                                transition: "all 0.3s ease",
                                "&:hover": {
                                    transform: "translateY(-8px)",
                                    boxShadow: "0 15px 50px rgba(168, 237, 234, 0.4)",
                                }
                            }}
                        >
                            <CardContent sx={{ p: { xs: 2, sm: 2.5, md: 3 } }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                                    <Typography variant="body2" sx={{ 
                                        opacity: 0.9, 
                                        textTransform: 'uppercase', 
                                        letterSpacing: 1, 
                                        fontWeight: 600,
                                        fontSize: { xs: '0.75rem', sm: '0.875rem' }
                                    }}>
                                        System Off Duration
                            </Typography>
                                    <PowerOff sx={{ fontSize: { xs: 28, sm: 32 }, opacity: 0.7 }} />
                                </Box>
                                <Box sx={{ mb: 2 }}>
                                    <Typography variant="h3" sx={{ 
                                        fontWeight: 700, 
                                        mb: 0.5,
                                        fontSize: { xs: '2rem', sm: '2.5rem', md: '3rem' }
                                    }}>
                                        {isLoading ? "..." : formatHours(parseFloat(cutOffHours) + parseFloat(missingDataHours))}
                            </Typography>
                                    <Typography variant="body2" sx={{ 
                                        opacity: 0.8, 
                                        mt: 1,
                                        fontSize: { xs: '0.75rem', sm: '0.875rem' }
                                    }}>
                                Total time system remained off
                            </Typography>
                                </Box>
                                {!isLoading && (
                                    <Box sx={{ 
                                        mt: 2, 
                                        pt: 2, 
                                        borderTop: '2px solid rgba(0,0,0,0.1)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 1
                                    }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Typography variant="body2" sx={{ opacity: 0.8, fontWeight: 500 }}>
                                                📊 Standby Mode:
                                            </Typography>
                                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                                {formatHours(cutOffHours)}
                                            </Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Typography variant="body2" sx={{ opacity: 0.8, fontWeight: 500 }}>
                                                ⚠️ Offline / Missing Data:
                                            </Typography>
                                            <Typography variant="body2" sx={{ fontWeight: 700, color: missingDataHours > 0 ? '#f44336' : 'inherit' }}>
                                                {formatHours(missingDataHours)}
                                            </Typography>
                                        </Box>
                                    </Box>
                                )}
                        </CardContent>
                    </Card>
                    </Fade>
                </Grid>

            </Grid>
            {isError && (
                <Typography variant="body2" color="error" sx={{ mb: 2, p: 2, background: 'rgba(244, 67, 54, 0.1)', borderRadius: 2 }}>
                    ⚠️ Error: {isError}
                </Typography>
            )}
            {!isLoadingGridStatus && gridFeedEnabled === false && (
                <Alert 
                    severity="warning" 
                    sx={{ 
                        mb: 2, 
                        background: 'linear-gradient(135deg, rgba(255, 152, 0, 0.1) 0%, rgba(255, 87, 34, 0.1) 100%)',
                        border: '2px solid rgba(255, 152, 0, 0.3)',
                        borderRadius: 3
                    }}
                >
                    <Typography variant="h6" sx={{ fontWeight: 600, color: '#ff5722', mb: 0.5 }}>
                        ⚠️ Grid Feeding Disabled
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#666', mb: 1 }}>
                        Your system is not feeding excess power to the grid. Enable it in the WatchPower app to maximize ROI.
                    </Typography>
                </Alert>
            )}
            {!isLoading && missingDataHours > 0 && (
                <Card 
                    sx={{ 
                        mb: 2, 
                        background: 'linear-gradient(135deg, rgba(255, 152, 0, 0.1) 0%, rgba(255, 87, 34, 0.1) 100%)',
                        border: '2px solid rgba(255, 152, 0, 0.3)',
                        borderRadius: 3
                    }}
                >
                    <CardContent sx={{ py: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Box sx={{ 
                                background: 'linear-gradient(135deg, #ff9800 0%, #ff5722 100%)',
                                borderRadius: '50%',
                                p: 1.5,
                                display: 'flex'
                            }}>
                                <PowerOff sx={{ fontSize: 28, color: 'white' }} />
                            </Box>
                            <Box sx={{ flex: 1 }}>
                                <Typography variant="h6" sx={{ fontWeight: 600, color: '#ff5722', mb: 0.5, fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                                    ⚠️ System Off / Missing Data Detected
                                </Typography>
                                <Typography variant="body2" sx={{ color: darkMode ? '#bbb' : '#666', fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                                    System was offline / off for <strong>{formatHours(missingDataHours)}</strong> across <strong>{missingDataGaps.length} gap{missingDataGaps.length !== 1 ? 's' : ''}</strong>. 
                                    Expected: {expectedDataPoints} data points (every 5 min) | Received: {data.length} data points | Missing: {Math.max(0, expectedDataPoints - data.length)} data points
                                </Typography>
                            </Box>
                        </Box>
                    </CardContent>
                </Card>
            )}
            <Card 
                className="muasn chart-card" 
                sx={{ 
                    mb: 3,
                    borderRadius: 4,
                    background: darkMode ? 'linear-gradient(145deg, #1e1e1e 0%, #2d2d2d 100%)' : 'linear-gradient(145deg, #ffffff 0%, #f8f9fa 100%)',
                    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
                    border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
                    ...(isFullscreen && {
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: 9999,
                        m: 0,
                        borderRadius: 0,
                        height: '100vh',
                        overflow: 'auto'
                    })
                }}
            >
                <CardContent className="myasn" sx={{ p: { xs: 2, md: 4 }, height: isFullscreen ? '100%' : 'auto' }}>
                    {/* Control Bar */}
                    <Box sx={{ 
                        display: "flex", 
                        flexWrap: "wrap", 
                        gap: 2, 
                        alignItems: "center", 
                        mb: 3,
                        p: 2,
                        background: darkMode ? 'rgba(255,255,255,0.05)' : `linear-gradient(135deg, ${currentTheme.primary}15 0%, ${currentTheme.secondary}15 100%)`,
                        borderRadius: 3,
                        border: `1px solid ${darkMode ? 'rgba(255,255,255,0.1)' : `${currentTheme.primary}30`}`
                    }}>
                        <IconButton 
                            onClick={handlePreviousDay}
                            sx={{
                                background: `linear-gradient(135deg, ${currentTheme.primary} 0%, ${currentTheme.secondary} 100%)`,
                                color: 'white',
                                '&:hover': {
                                    background: `linear-gradient(135deg, ${currentTheme.secondary} 0%, ${currentTheme.primary} 100%)`,
                                },
                                transition: 'all 0.3s ease',
                                boxShadow: `0 4px 15px ${currentTheme.primary}50`,
                            }}
                        >
                            <ChevronLeft />
                        </IconButton>
                        <TextField
                            label="Select Date"
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <CalendarToday sx={{ color: currentTheme.primary }} />
                                    </InputAdornment>
                                ),
                            }}
                            sx={{ 
                                minWidth: 200,
                                '& .MuiOutlinedInput-root': {
                                    borderRadius: 3,
                                    '&:hover fieldset': {
                                        borderColor: currentTheme.primary,
                                    },
                                    '&.Mui-focused fieldset': {
                                        borderColor: currentTheme.primary,
                                    },
                                }
                            }}
                        />
                        <IconButton 
                            onClick={handleNextDay}
                            disabled={selectedDate >= getTodayLocal()}
                            sx={{
                                background: selectedDate >= getTodayLocal() 
                                    ? 'rgba(0,0,0,0.12)' 
                                    : `linear-gradient(135deg, ${currentTheme.primary} 0%, ${currentTheme.secondary} 100%)`,
                                color: 'white',
                                '&:hover': {
                                    background: selectedDate >= getTodayLocal()
                                        ? 'rgba(0,0,0,0.12)'
                                        : `linear-gradient(135deg, ${currentTheme.secondary} 0%, ${currentTheme.primary} 100%)`,
                                },
                                transition: 'all 0.3s ease',
                                boxShadow: `0 4px 15px ${currentTheme.primary}50`,
                                '&:disabled': {
                                    color: 'rgba(255,255,255,0.5)',
                                }
                            }}
                        >
                            <ChevronRight />
                        </IconButton>
                        
                        {/* Today Button */}
                        <Tooltip title="Go to Today">
                            <Button
                                onClick={handleTodayClick}
                                startIcon={<TodayIcon />}
                                variant="contained"
                                sx={{
                                    background: `linear-gradient(135deg, ${currentTheme.primary} 0%, ${currentTheme.secondary} 100%)`,
                                    color: 'white',
                                    borderRadius: 3,
                                    px: 3,
                                    textTransform: 'none',
                                    fontWeight: 600,
                                    boxShadow: `0 4px 15px ${currentTheme.primary}50`,
                                    '&:hover': {
                                        background: `linear-gradient(135deg, ${currentTheme.secondary} 0%, ${currentTheme.primary} 100%)`,
                                    }
                                }}
                            >
                                Today
                            </Button>
                        </Tooltip>
                        
                        {/* Refresh Button */}
                        <Tooltip title="Refresh Data">
                            <IconButton 
                                onClick={handleRefresh} 
                                disabled={isLoading}
                                sx={{
                                    background: `linear-gradient(135deg, ${currentTheme.primary} 0%, ${currentTheme.secondary} 100%)`,
                                    color: 'white',
                                    '&:hover': {
                                        background: `linear-gradient(135deg, ${currentTheme.secondary} 0%, ${currentTheme.primary} 100%)`,
                                        transform: 'rotate(180deg)',
                                    },
                                    transition: 'all 0.5s ease',
                                    boxShadow: `0 4px 15px ${currentTheme.primary}50`,
                                }}
                            >
                            <Refresh />
                        </IconButton>
                        </Tooltip>
                        
                        {/* Live Mode Toggle */}
                        <Tooltip title={isLiveMode ? "Disable Live Mode" : "Enable Live Mode"}>
                            <IconButton 
                                onClick={() => setIsLiveMode(!isLiveMode)}
                                sx={{
                                    background: isLiveMode 
                                        ? `linear-gradient(135deg, ${currentTheme.primary} 0%, ${currentTheme.secondary} 100%)`
                                        : 'rgba(0,0,0,0.12)',
                                    color: isLiveMode ? 'white' : 'text.secondary',
                                    '&:hover': {
                                        background: isLiveMode 
                                            ? `linear-gradient(135deg, ${currentTheme.secondary} 0%, ${currentTheme.primary} 100%)`
                                            : 'rgba(0,0,0,0.2)',
                                    },
                                    transition: 'all 0.3s ease',
                                    boxShadow: isLiveMode ? `0 4px 15px ${currentTheme.primary}50` : 'none',
                                }}
                            >
                                {isLiveMode ? <Pause /> : <PlayArrow />}
                            </IconButton>
                        </Tooltip>
                        
                        {/* Fullscreen Toggle */}
                        <Tooltip title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}>
                            <IconButton 
                                onClick={handleFullscreenToggle}
                                sx={{
                                    background: `linear-gradient(135deg, ${currentTheme.primary} 0%, ${currentTheme.secondary} 100%)`,
                                    color: 'white',
                                    '&:hover': {
                                        background: `linear-gradient(135deg, ${currentTheme.secondary} 0%, ${currentTheme.primary} 100%)`,
                                    },
                                    transition: 'all 0.3s ease',
                                    boxShadow: `0 4px 15px ${currentTheme.primary}50`,
                                }}
                            >
                                {isFullscreen ? <FullscreenExit /> : <Fullscreen />}
                            </IconButton>
                        </Tooltip>
                        
                        <Chip 
                            icon={<CalendarToday />}
                            label={`Last updated: ${lastUpdated.toLocaleTimeString()}`}
                            sx={{ 
                                ml: "auto",
                                background: darkMode ? 'rgba(255,255,255,0.1)' : `linear-gradient(135deg, ${currentTheme.primary}15 0%, ${currentTheme.secondary}15 100%)`,
                                fontWeight: 500,
                                borderRadius: 3,
                                px: 1
                            }}
                        />
                        {!isLoading && data.length > 0 && (
                            <Chip 
                                label={`${data.length}/${expectedDataPoints} data points`}
                                size="small"
                                sx={{ 
                                    background: data.length === expectedDataPoints 
                                        ? 'linear-gradient(135deg, #4caf50 0%, #66bb6a 100%)' 
                                        : 'linear-gradient(135deg, #ff9800 0%, #ff5722 100%)',
                                    color: 'white',
                                    fontWeight: 600,
                                    borderRadius: 2
                                }}
                            />
                        )}
                        {!isLoading && maxPvPoint && maxPvPoint.pv_power > 0 && (
                            <Chip 
                                icon={<SolarIcon sx={{ fontSize: '15px !important', color: '#ffb300 !important' }} />}
                                label={`Peak: ${maxPvPoint.pv_power} W (${maxPvPoint.time.slice(0, 5)})`}
                                size="small"
                                sx={{ 
                                    background: darkMode ? 'rgba(255, 179, 0, 0.15)' : 'rgba(255, 179, 0, 0.12)',
                                    color: darkMode ? '#ffca28' : '#e65100',
                                    border: '1px solid rgba(255, 179, 0, 0.4)',
                                    fontWeight: 700,
                                    borderRadius: 2
                                }}
                            />
                        )}
                    </Box>

                    <Box sx={{ 
                        display: "flex", 
                        flexWrap: "wrap", 
                        gap: 2, 
                        mb: 3,
                        p: 2,
                        background: 'rgba(102, 126, 234, 0.05)',
                        borderRadius: 3,
                        border: '1px solid rgba(102, 126, 234, 0.1)'
                    }}>
                        <Box sx={{ display: "flex", alignItems: "center" }}>
                            <Box
                                sx={{
                                    width: 20,
                                    height: 20,
                                    backgroundColor: "rgba(76, 175, 80, 0.3)",
                                    border: "2px solid #4caf50",
                                    borderRadius: 2,
                                    mr: 1.5,
                                }}
                            />
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>Electricity Connected</Typography>
                        </Box>
                        <Box sx={{ display: "flex", alignItems: "center" }}>
                            <Box
                                sx={{
                                    width: 20,
                                    height: 20,
                                    backgroundColor: "rgba(244, 67, 54, 0.3)",
                                    border: "2px solid #f44336",
                                    borderRadius: 2,
                                    mr: 1.5,
                                }}
                            />
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>Electricity Disconnected</Typography>
                        </Box>
                        <Box sx={{ display: "flex", alignItems: "center" }}>
                            <Box
                                sx={{
                                    width: 20,
                                    height: 20,
                                    backgroundColor: "rgba(255, 152, 0, 0.3)",
                                    border: "2px solid #ff9800",
                                    borderRadius: 2,
                                    mr: 1.5,
                                }}
                            />
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>System Off</Typography>
                        </Box>
                        {missingDataGaps.length > 0 && (
                            <Box sx={{ display: "flex", alignItems: "center" }}>
                                <Box
                                    sx={{
                                        width: 20,
                                        height: 20,
                                        backgroundColor: "rgba(255, 0, 0, 0.15)",
                                        border: "2px dashed #f44336",
                                        borderRadius: 2,
                                        mr: 1.5,
                                    }}
                                />
                                <Typography variant="body2" sx={{ fontWeight: 500, color: '#f44336' }}>
                                    ⚠️ Missing Data ({missingDataGaps.length} gaps - {formatHours(missingDataHours)})
                                </Typography>
                            </Box>
                        )}
                    </Box>

                    {isLoading ? (
                        <Box sx={{ display: "flex", flexDirection: 'column', justifyContent: "center", alignItems: "center", height: 400 }}>
                            <Refresh sx={{ 
                                animation: "spin 1s linear infinite", 
                                fontSize: 60, 
                                color: "#667eea",
                                mb: 2
                            }} />
                            <Typography variant="h6" sx={{ color: '#667eea', fontWeight: 500 }}>
                                Loading data...
                            </Typography>
                        </Box>
                    ) : (
                        <ResponsiveContainer width="100%" height={450} minHeight={300}>
                            <AreaChart data={data} margin={{ top: 20, right: 10, left: -20, bottom: 20 }}>
                                <defs>
                                    <linearGradient id="pvColor" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.9} />
                                        <stop offset="95%" stopColor="#82ca9d" stopOpacity={0.1} />
                                    </linearGradient>
                                    <linearGradient id="loadColor" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8884d8" stopOpacity={0.9} />
                                        <stop offset="95%" stopColor="#8884d8" stopOpacity={0.1} />
                                    </linearGradient>
                                </defs>

                                {modeZones.map((zone, index) => (
                                    <ReferenceArea
                                        key={index}
                                        x1={data[zone.start]?.time}
                                        x2={data[zone.end]?.time}
                                        fill={getModeColor(zone.mode)}
                                        strokeOpacity={0.3}
                                    />
                                ))}

                                {/* Missing data gaps visualization with mobile-friendly badges */}
                                {missingDataGaps.map((gap, index) => (
                                    <ReferenceArea
                                        key={`gap-${index}`}
                                        x1={gap.start}
                                        x2={gap.end}
                                        fill="rgba(255, 0, 0, 0.12)"
                                        stroke="rgba(255, 0, 0, 0.5)"
                                        strokeWidth={1.5}
                                        strokeDasharray="4 4"
                                        ifOverflow="visible"
                                        label={(labelProps) => (
                                            <CustomGapLabel
                                                {...labelProps}
                                                gap={gap}
                                                index={index}
                                                isMobile={isMobile}
                                                darkMode={darkMode}
                                            />
                                        )}
                                    />
                                ))}

                                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" opacity={0.5} />
                                <XAxis 
                                    dataKey="time" 
                                    tick={{ fill: '#666', fontSize: 12 }}
                                    stroke="#999"
                                />
                                <YAxis 
                                    tickFormatter={(value) => `${value / 1000}k`}
                                    tick={{ fill: '#666', fontSize: 12 }}
                                    stroke="#999"
                                />
                                <RechartsTooltip content={<CustomTooltip />} />
                                <Legend 
                                    wrapperStyle={{ 
                                        paddingTop: '20px',
                                        fontSize: '14px',
                                        fontWeight: 500
                                    }}
                                />

                                <Area
                                    type="monotone"
                                    dataKey="pv_power"
                                    stroke="#82ca9d"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#pvColor)"
                                    name="PV Power (W)"
                                />
                                <Area
                                    type="monotone"
                                    dataKey="load_power"
                                    stroke="#8884d8"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#loadColor)"
                                    name="Load Power (W)"
                                />

                                {/* Max Point of Production */}
                                {maxPvPoint && maxPvPoint.pv_power > 0 && (
                                    <ReferenceDot
                                        x={maxPvPoint.time}
                                        y={maxPvPoint.pv_power}
                                        r={isMobile ? 5 : 6}
                                        fill="#ffb300"
                                        stroke="#ffffff"
                                        strokeWidth={2.5}
                                        ifOverflow="visible"
                                        label={(labelProps) => (
                                            <CustomMaxPointLabel
                                                {...labelProps}
                                                maxPoint={maxPvPoint}
                                                isMobile={isMobile}
                                                darkMode={darkMode}
                                            />
                                        )}
                                    />
                                )}
                            </AreaChart>
                        </ResponsiveContainer>
                    )}

                    {/* Mobile-Friendly Gap Summary Breakdown */}
                    {!isLoading && missingDataGaps.length > 0 && (
                        <Box sx={{ 
                            mt: 2, 
                            p: { xs: 1.5, sm: 2 }, 
                            backgroundColor: darkMode ? 'rgba(244, 67, 54, 0.08)' : 'rgba(244, 67, 54, 0.04)', 
                            borderRadius: 3, 
                            border: '1px solid rgba(244, 67, 54, 0.2)' 
                        }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <PowerOff sx={{ fontSize: 18, color: '#f44336' }} />
                                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: darkMode ? '#ff8a80' : '#d32f2f', fontSize: { xs: '0.8rem', sm: '0.875rem' } }}>
                                        System Off Intervals ({missingDataGaps.length} {missingDataGaps.length === 1 ? 'gap' : 'gaps'}) — Total: {formatHours(missingDataHours)}
                                    </Typography>
                                </Box>
                                <Typography variant="caption" sx={{ color: darkMode ? '#bbb' : '#666', fontWeight: 500 }}>
                                    {isMobile ? 'Downtime details' : 'Exact downtime periods recorded'}
                                </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                {missingDataGaps.map((gap, idx) => (
                                    <Chip
                                        key={idx}
                                        size="small"
                                        icon={<PowerOff sx={{ fontSize: '13px !important', color: '#f44336' }} />}
                                        label={`${gap.start.slice(0, 5)} - ${gap.end.slice(0, 5)} (${formatMissingDuration(gap.duration)})`}
                                        sx={{
                                            backgroundColor: darkMode ? 'rgba(30, 30, 30, 0.9)' : 'rgba(255, 255, 255, 0.95)',
                                            borderColor: 'rgba(244, 67, 54, 0.4)',
                                            color: darkMode ? '#ff8a80' : '#c62828',
                                            fontSize: { xs: '0.72rem', sm: '0.78rem' },
                                            fontWeight: 600,
                                            py: 0.5,
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
                                        }}
                                        variant="outlined"
                                    />
                                ))}
                            </Box>
                        </Box>
                    )}
                </CardContent>
            </Card>
        </Box >
    );
};

export default DailyStats;

