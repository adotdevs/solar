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
    PowerOff,
    ChevronLeft,
    ChevronRight,
    Fullscreen,
    FullscreenExit,
    PlayArrow,
    Pause,
    Today as TodayIcon,
    Close,
    TouchApp,
    Speed,
    ElectricBolt
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
    const [scrubbedPoint, setScrubbedPoint] = useState(null);

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
        useEffect(() => {
            if (active && payload && payload.length) {
                setScrubbedPoint(payload[0].payload);
            }
        }, [active, payload]);

        // On mobile, suppress the floating card so it never blocks the screen or finger
        if (isMobile) {
            return null;
        }

        if (active && payload && payload.length) {
            const currentData = payload[0].payload;
            const modeColor = currentData.mode === "Line Mode"
                ? "#10b981"
                : currentData.mode === "Battery Mode"
                    ? "#f59e0b"
                    : "#ef4444";

            return (
                <Paper 
                    elevation={10} 
                    sx={{ 
                        p: 2, 
                        backgroundColor: darkMode ? "rgba(15, 23, 42, 0.95)" : "rgba(255, 255, 255, 0.96)",
                        backdropFilter: 'blur(12px)',
                        borderRadius: 3,
                        border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)'}`,
                        color: darkMode ? '#f1f5f9' : '#0f172a',
                        minWidth: 190,
                        boxShadow: darkMode ? '0 10px 30px rgba(0,0,0,0.5)' : '0 10px 30px rgba(0,0,0,0.1)'
                    }}
                >
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: darkMode ? '#f8fafc' : '#0f172a', display: 'flex', alignItems: 'center', gap: 0.8 }}>
                        ⏰ {label}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.8 }}>
                        <Box sx={{ 
                            width: 10, 
                            height: 10, 
                            borderRadius: '50%', 
                            backgroundColor: '#10b981',
                            mr: 1.2,
                            boxShadow: '0 0 8px rgba(16, 185, 129, 0.6)'
                        }} />
                        <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.85rem' }}>
                            PV: <strong style={{ color: '#10b981' }}>{currentData.pv_power} W</strong>
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.2 }}>
                        <Box sx={{ 
                            width: 10, 
                            height: 10, 
                            borderRadius: '50%', 
                            backgroundColor: '#6366f1',
                            mr: 1.2,
                            boxShadow: '0 0 8px rgba(99, 102, 241, 0.6)'
                        }} />
                        <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.85rem' }}>
                            Load: <strong style={{ color: '#6366f1' }}>{currentData.load_power} W</strong>
                        </Typography>
                    </Box>
                    <Box sx={{ 
                        pt: 1, 
                        borderTop: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'}`,
                        display: 'flex',
                        alignItems: 'center'
                    }}>
                        <Box sx={{ 
                            width: 8, 
                            height: 8, 
                            borderRadius: '50%', 
                            backgroundColor: modeColor,
                            mr: 1.2
                        }} />
                        <Typography variant="caption" sx={{ color: modeColor, fontWeight: 700 }}>
                            {currentData.mode === "Line Mode" ? "⚡ Connected (Grid)" :
                                currentData.mode === "Battery Mode" ? "⚡ Off-Grid Mode" :
                                    currentData.mode === "Standby Mode" ? "⏸️ System Off" : (currentData.mode || "Standby")}
                        </Typography>
                    </Box>
                    {(() => {
                        const borderingGap = missingDataGaps.find(g => g.start === label || g.end === label);
                        if (!borderingGap) return null;
                        return (
                            <Box sx={{ 
                                mt: 1.2, 
                                pt: 0.8, 
                                borderTop: '1px dashed rgba(239, 68, 68, 0.4)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.8
                            }}>
                                <PowerOff sx={{ fontSize: 14, color: '#ef4444' }} />
                                <Typography variant="caption" sx={{ color: '#ef4444', fontWeight: 600 }}>
                                    {borderingGap.start === label ? 'Downtime started' : 'System resumed'} ({formatMissingDuration(borderingGap.duration)})
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
            <Box sx={{
                display: 'grid',
                gridTemplateColumns: {
                    xs: '1fr',
                    sm: 'repeat(2, 1fr)',
                    md: 'repeat(3, 1fr)',
                    lg: 'repeat(5, 1fr)'
                },
                gap: { xs: 1.5, sm: 2, md: 2.5 },
                mb: { xs: 2.5, sm: 3 }
            }}>
                {/* 1. Solar Production Card */}
                <Fade in timeout={400}>
                    <Card 
                        className="stat-card"
                        sx={{
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            borderRadius: 4,
                            background: darkMode 
                                ? 'linear-gradient(145deg, rgba(17, 24, 39, 0.9) 0%, rgba(30, 41, 59, 0.75) 100%)' 
                                : 'linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)',
                            border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(226, 232, 240, 0.9)'}`,
                            borderTop: '3.5px solid #10b981',
                            boxShadow: darkMode ? '0 8px 30px rgba(0, 0, 0, 0.3)' : '0 8px 30px rgba(0, 0, 0, 0.04)',
                            backdropFilter: 'blur(12px)',
                            transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                            '&:hover': {
                                transform: 'translateY(-4px)',
                                boxShadow: '0 14px 35px rgba(16, 185, 129, 0.2)',
                                borderColor: 'rgba(16, 185, 129, 0.4)'
                            }
                        }}
                    >
                        <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } } }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                                <Typography variant="caption" sx={{ 
                                    color: darkMode ? '#94a3b8' : '#64748b', 
                                    textTransform: 'uppercase', 
                                    letterSpacing: 1.2,
                                    fontWeight: 700,
                                    fontSize: '0.72rem'
                                }}>
                                    Solar Production
                                </Typography>
                                <Box sx={{ 
                                    p: 0.9, 
                                    borderRadius: 3, 
                                    bgcolor: 'rgba(16, 185, 129, 0.12)',
                                    color: '#10b981',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <SolarIcon sx={{ fontSize: 22 }} />
                                </Box>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.8, mb: 0.5 }}>
                                <Typography variant="h4" sx={{ 
                                    fontWeight: 800, 
                                    color: darkMode ? '#f8fafc' : '#0f172a',
                                    fontSize: { xs: '1.75rem', sm: '2rem' }
                                }}>
                                    {isLoading ? "..." : total}
                                </Typography>
                                <Typography variant="subtitle1" sx={{ color: '#10b981', fontWeight: 700 }}>
                                    kWh
                                </Typography>
                            </Box>
                            <Typography variant="caption" sx={{ color: darkMode ? '#64748b' : '#94a3b8', display: 'block', mb: 1.5, fontWeight: 500 }}>
                                Total PV Generated
                            </Typography>
                            {!isLoading && maxPvPoint && maxPvPoint.pv_power > 0 ? (
                                <Box sx={{ 
                                    pt: 1.2, 
                                    borderTop: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between'
                                }}>
                                    <Typography variant="caption" sx={{ color: darkMode ? '#cbd5e1' : '#475569', fontWeight: 600 }}>
                                        ⚡ Peak Power:
                                    </Typography>
                                    <Chip 
                                        size="small" 
                                        label={`${maxPvPoint.pv_power} W (${maxPvPoint.time.slice(0, 5)})`}
                                        sx={{ 
                                            bgcolor: 'rgba(16, 185, 129, 0.12)', 
                                            color: '#10b981', 
                                            fontWeight: 700, 
                                            fontSize: '0.72rem',
                                            height: 22
                                        }} 
                                    />
                                </Box>
                            ) : null}
                        </CardContent>
                    </Card>
                </Fade>

                {/* 2. Energy Usage Card */}
                <Fade in timeout={500}>
                    <Card 
                        className="stat-card"
                        sx={{
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            borderRadius: 4,
                            background: darkMode 
                                ? 'linear-gradient(145deg, rgba(17, 24, 39, 0.9) 0%, rgba(30, 41, 59, 0.75) 100%)' 
                                : 'linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)',
                            border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(226, 232, 240, 0.9)'}`,
                            borderTop: '3.5px solid #6366f1',
                            boxShadow: darkMode ? '0 8px 30px rgba(0, 0, 0, 0.3)' : '0 8px 30px rgba(0, 0, 0, 0.04)',
                            backdropFilter: 'blur(12px)',
                            transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                            '&:hover': {
                                transform: 'translateY(-4px)',
                                boxShadow: '0 14px 35px rgba(99, 102, 241, 0.2)',
                                borderColor: 'rgba(99, 102, 241, 0.4)'
                            }
                        }}
                    >
                        <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } } }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                                <Typography variant="caption" sx={{ 
                                    color: darkMode ? '#94a3b8' : '#64748b', 
                                    textTransform: 'uppercase', 
                                    letterSpacing: 1.2,
                                    fontWeight: 700,
                                    fontSize: '0.72rem'
                                }}>
                                    Energy Usage
                                </Typography>
                                <Box sx={{ 
                                    p: 0.9, 
                                    borderRadius: 3, 
                                    bgcolor: 'rgba(99, 102, 241, 0.12)',
                                    color: '#6366f1',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <TrendingUp sx={{ fontSize: 22 }} />
                                </Box>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.8, mb: 0.5 }}>
                                <Typography variant="h4" sx={{ 
                                    fontWeight: 800, 
                                    color: darkMode ? '#f8fafc' : '#0f172a',
                                    fontSize: { xs: '1.75rem', sm: '2rem' }
                                }}>
                                    {isLoading ? "..." : loadTotal}
                                </Typography>
                                <Typography variant="subtitle1" sx={{ color: '#6366f1', fontWeight: 700 }}>
                                    kWh
                                </Typography>
                            </Box>
                            <Typography variant="caption" sx={{ color: darkMode ? '#64748b' : '#94a3b8', display: 'block', mb: 1.5, fontWeight: 500 }}>
                                Total Load Consumption
                            </Typography>
                            {!isLoading && total > 0 ? (
                                <Box sx={{ 
                                    pt: 1.2, 
                                    borderTop: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between'
                                }}>
                                    <Typography variant="caption" sx={{ color: darkMode ? '#cbd5e1' : '#475569', fontWeight: 600 }}>
                                        Consumption:
                                    </Typography>
                                    <Chip 
                                        size="small" 
                                        label={`${((loadTotal / total) * 100).toFixed(0)}% of Solar`}
                                        sx={{ 
                                            bgcolor: 'rgba(99, 102, 241, 0.12)', 
                                            color: '#6366f1', 
                                            fontWeight: 700, 
                                            fontSize: '0.72rem',
                                            height: 22
                                        }} 
                                    />
                                </Box>
                            ) : null}
                        </CardContent>
                    </Card>
                </Fade>

                {/* 3. Grid Contribution Card */}
                <Fade in timeout={600}>
                    <Card 
                        className="stat-card"
                        sx={{
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            borderRadius: 4,
                            background: darkMode 
                                ? 'linear-gradient(145deg, rgba(17, 24, 39, 0.9) 0%, rgba(30, 41, 59, 0.75) 100%)' 
                                : 'linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)',
                            border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(226, 232, 240, 0.9)'}`,
                            borderTop: '3.5px solid #0ea5e9',
                            boxShadow: darkMode ? '0 8px 30px rgba(0, 0, 0, 0.3)' : '0 8px 30px rgba(0, 0, 0, 0.04)',
                            backdropFilter: 'blur(12px)',
                            transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                            '&:hover': {
                                transform: 'translateY(-4px)',
                                boxShadow: '0 14px 35px rgba(14, 165, 233, 0.2)',
                                borderColor: 'rgba(14, 165, 233, 0.4)'
                            }
                        }}
                    >
                        <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } } }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                                <Typography variant="caption" sx={{ 
                                    color: darkMode ? '#94a3b8' : '#64748b', 
                                    textTransform: 'uppercase', 
                                    letterSpacing: 1.2,
                                    fontWeight: 700,
                                    fontSize: '0.72rem'
                                }}>
                                    Grid Contribution
                                </Typography>
                                <Box sx={{ 
                                    p: 0.9, 
                                    borderRadius: 3, 
                                    bgcolor: 'rgba(14, 165, 233, 0.12)',
                                    color: '#0ea5e9',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <ElectricBolt sx={{ fontSize: 22 }} />
                                </Box>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.8, mb: 0.5 }}>
                                <Typography variant="h4" sx={{ 
                                    fontWeight: 800, 
                                    color: darkMode ? '#f8fafc' : '#0f172a',
                                    fontSize: { xs: '1.75rem', sm: '2rem' }
                                }}>
                                    {isLoading ? "..." : (total - loadTotal).toFixed(2)}
                                </Typography>
                                <Typography variant="subtitle1" sx={{ color: '#0ea5e9', fontWeight: 700 }}>
                                    kWh
                                </Typography>
                            </Box>
                            <Typography variant="caption" sx={{ color: darkMode ? '#64748b' : '#94a3b8', display: 'block', mb: 1.5, fontWeight: 500 }}>
                                Net Energy Fed to Grid
                            </Typography>
                            <Box sx={{ 
                                pt: 1.2, 
                                borderTop: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                            }}>
                                <Typography variant="caption" sx={{ color: darkMode ? '#cbd5e1' : '#475569', fontWeight: 600 }}>
                                    Grid Feed Status:
                                </Typography>
                                <Chip 
                                    size="small" 
                                    label={gridFeedEnabled === false ? "Feeding Off" : "Active Feed"}
                                    sx={{ 
                                        bgcolor: gridFeedEnabled === false ? 'rgba(245, 158, 11, 0.12)' : 'rgba(14, 165, 233, 0.12)', 
                                        color: gridFeedEnabled === false ? '#f59e0b' : '#0ea5e9', 
                                        fontWeight: 700, 
                                        fontSize: '0.72rem',
                                        height: 22
                                    }} 
                                />
                            </Box>
                        </CardContent>
                    </Card>
                </Fade>

                {/* 4. Load Shedding Card */}
                <Fade in timeout={700}>
                    <Card 
                        className="stat-card"
                        sx={{
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            borderRadius: 4,
                            background: darkMode 
                                ? 'linear-gradient(145deg, rgba(17, 24, 39, 0.9) 0%, rgba(30, 41, 59, 0.75) 100%)' 
                                : 'linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)',
                            border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(226, 232, 240, 0.9)'}`,
                            borderTop: '3.5px solid #f59e0b',
                            boxShadow: darkMode ? '0 8px 30px rgba(0, 0, 0, 0.3)' : '0 8px 30px rgba(0, 0, 0, 0.04)',
                            backdropFilter: 'blur(12px)',
                            transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                            '&:hover': {
                                transform: 'translateY(-4px)',
                                boxShadow: '0 14px 35px rgba(245, 158, 11, 0.2)',
                                borderColor: 'rgba(245, 158, 11, 0.4)'
                            }
                        }}
                    >
                        <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } } }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                                <Typography variant="caption" sx={{ 
                                    color: darkMode ? '#94a3b8' : '#64748b', 
                                    textTransform: 'uppercase', 
                                    letterSpacing: 1.2,
                                    fontWeight: 700,
                                    fontSize: '0.72rem'
                                }}>
                                    Load Shedding
                                </Typography>
                                <Box sx={{ 
                                    p: 0.9, 
                                    borderRadius: 3, 
                                    bgcolor: 'rgba(245, 158, 11, 0.12)',
                                    color: '#f59e0b',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <PowerOff sx={{ fontSize: 22 }} />
                                </Box>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.8, mb: 0.5 }}>
                                <Typography variant="h4" sx={{ 
                                    fontWeight: 800, 
                                    color: darkMode ? '#f8fafc' : '#0f172a',
                                    fontSize: { xs: '1.4rem', sm: '1.65rem' }
                                }}>
                                    {isLoading ? "..." : formatHours(loadSheddingHours)}
                                </Typography>
                            </Box>
                            <Typography variant="caption" sx={{ color: darkMode ? '#64748b' : '#94a3b8', display: 'block', mb: 1.5, fontWeight: 500 }}>
                                Grid Outage Duration
                            </Typography>
                            <Box sx={{ 
                                pt: 1.2, 
                                borderTop: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                            }}>
                                <Typography variant="caption" sx={{ color: darkMode ? '#cbd5e1' : '#475569', fontWeight: 600 }}>
                                    Grid Outage:
                                </Typography>
                                <Chip 
                                    size="small" 
                                    label="Power Cut Duration"
                                    sx={{ 
                                        bgcolor: 'rgba(245, 158, 11, 0.12)', 
                                        color: '#f59e0b', 
                                        fontWeight: 700, 
                                        fontSize: '0.72rem',
                                        height: 22
                                    }} 
                                />
                            </Box>
                        </CardContent>
                    </Card>
                </Fade>

                {/* 5. System Off Duration Card */}
                <Fade in timeout={800}>
                    <Card 
                        className="stat-card"
                        sx={{
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            borderRadius: 4,
                            background: darkMode 
                                ? 'linear-gradient(145deg, rgba(17, 24, 39, 0.9) 0%, rgba(30, 41, 59, 0.75) 100%)' 
                                : 'linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)',
                            border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(226, 232, 240, 0.9)'}`,
                            borderTop: '3.5px solid #ef4444',
                            boxShadow: darkMode ? '0 8px 30px rgba(0, 0, 0, 0.3)' : '0 8px 30px rgba(0, 0, 0, 0.04)',
                            backdropFilter: 'blur(12px)',
                            transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                            '&:hover': {
                                transform: 'translateY(-4px)',
                                boxShadow: '0 14px 35px rgba(239, 68, 68, 0.2)',
                                borderColor: 'rgba(239, 68, 68, 0.4)'
                            }
                        }}
                    >
                        <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } } }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                                <Typography variant="caption" sx={{ 
                                    color: darkMode ? '#94a3b8' : '#64748b', 
                                    textTransform: 'uppercase', 
                                    letterSpacing: 1.2,
                                    fontWeight: 700,
                                    fontSize: '0.72rem'
                                }}>
                                    System Off Duration
                                </Typography>
                                <Box sx={{ 
                                    p: 0.9, 
                                    borderRadius: 3, 
                                    bgcolor: 'rgba(239, 68, 68, 0.12)',
                                    color: '#ef4444',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <PowerOff sx={{ fontSize: 22 }} />
                                </Box>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.8, mb: 0.5 }}>
                                <Typography variant="h4" sx={{ 
                                    fontWeight: 800, 
                                    color: darkMode ? '#f8fafc' : '#0f172a',
                                    fontSize: { xs: '1.4rem', sm: '1.65rem' }
                                }}>
                                    {isLoading ? "..." : formatHours(parseFloat(cutOffHours) + parseFloat(missingDataHours))}
                                </Typography>
                            </Box>
                            <Typography variant="caption" sx={{ color: darkMode ? '#64748b' : '#94a3b8', display: 'block', mb: 1.5, fontWeight: 500 }}>
                                Total System Downtime
                            </Typography>
                            {!isLoading ? (
                                <Box sx={{ 
                                    pt: 1.2, 
                                    borderTop: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}`,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 0.5
                                }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Typography variant="caption" sx={{ color: darkMode ? '#cbd5e1' : '#64748b', fontSize: '0.7rem' }}>
                                            Standby:
                                        </Typography>
                                        <Typography variant="caption" sx={{ fontWeight: 700, color: darkMode ? '#cbd5e1' : '#334155', fontSize: '0.7rem' }}>
                                            {formatHours(cutOffHours)}
                                        </Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Typography variant="caption" sx={{ color: darkMode ? '#cbd5e1' : '#64748b', fontSize: '0.7rem' }}>
                                            Offline Gaps:
                                        </Typography>
                                        <Typography variant="caption" sx={{ fontWeight: 700, color: missingDataHours > 0 ? '#ef4444' : 'inherit', fontSize: '0.7rem' }}>
                                            {formatHours(missingDataHours)}
                                        </Typography>
                                    </Box>
                                </Box>
                            ) : null}
                        </CardContent>
                    </Card>
                </Fade>
            </Box>
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

                    {/* Live Telemetry Inspection HUD Bar (Unobstructed Mobile & Desktop HUD) */}
                    <Box 
                        sx={{ 
                            mb: 2.5,
                            p: { xs: 1.5, sm: 2 },
                            borderRadius: 3,
                            background: scrubbedPoint 
                                ? (darkMode ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(99, 102, 241, 0.12) 100%)' : 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(99, 102, 241, 0.08) 100%)')
                                : (darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(241, 245, 249, 0.8)'),
                            border: scrubbedPoint
                                ? '1.5px solid rgba(16, 185, 129, 0.45)'
                                : `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(226, 232, 240, 0.8)'}`,
                            transition: 'all 0.25s ease',
                            boxShadow: scrubbedPoint ? '0 4px 20px rgba(16, 185, 129, 0.12)' : 'none'
                        }}
                    >
                        {scrubbedPoint ? (
                            <Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Box sx={{ 
                                            width: 8, 
                                            height: 8, 
                                            borderRadius: '50%', 
                                            bgcolor: '#10b981',
                                            boxShadow: '0 0 10px #10b981',
                                            animation: 'pulseGlow 1.5s infinite ease-in-out'
                                        }} />
                                        <Typography variant="subtitle2" sx={{ fontWeight: 800, letterSpacing: 0.5, fontSize: { xs: '0.8rem', sm: '0.9rem' } }}>
                                            INSPECTING: <span style={{ color: '#10b981', fontWeight: 800 }}>{scrubbedPoint.time}</span>
                                        </Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Chip 
                                            size="small" 
                                            label={
                                                scrubbedPoint.mode === "Line Mode" ? "⚡ Connected (Grid)" :
                                                scrubbedPoint.mode === "Battery Mode" ? "⚡ Off-Grid Outage" :
                                                "⏸️ System Off"
                                            }
                                            sx={{ 
                                                fontWeight: 700,
                                                fontSize: { xs: '0.7rem', sm: '0.75rem' },
                                                bgcolor: scrubbedPoint.mode === "Line Mode" ? 'rgba(16, 185, 129, 0.15)' :
                                                         scrubbedPoint.mode === "Battery Mode" ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                                color: scrubbedPoint.mode === "Line Mode" ? '#10b981' :
                                                       scrubbedPoint.mode === "Battery Mode" ? '#f59e0b' : '#ef4444',
                                                border: `1px solid ${scrubbedPoint.mode === "Line Mode" ? 'rgba(16, 185, 129, 0.4)' : scrubbedPoint.mode === "Battery Mode" ? 'rgba(245, 158, 11, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`
                                            }}
                                        />
                                        <IconButton 
                                            size="small" 
                                            onClick={() => setScrubbedPoint(null)}
                                            sx={{ 
                                                p: 0.5, 
                                                bgcolor: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                                                '&:hover': { bgcolor: darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)' }
                                            }}
                                            title="Clear inspection point"
                                        >
                                            <Close sx={{ fontSize: 16 }} />
                                        </IconButton>
                                    </Box>
                                </Box>
                                
                                <Grid container spacing={1.5}>
                                    <Grid item xs={6} sm={4}>
                                        <Box sx={{ 
                                            p: { xs: 1, sm: 1.5 }, 
                                            borderRadius: 2.5, 
                                            bgcolor: darkMode ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.08)',
                                            border: '1px solid rgba(16, 185, 129, 0.25)'
                                        }}>
                                            <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 700, display: 'block', mb: 0.2, fontSize: { xs: '0.68rem', sm: '0.75rem' } }}>
                                                ☀️ Solar PV Power
                                            </Typography>
                                            <Typography variant="h6" sx={{ fontWeight: 800, color: '#10b981', fontSize: { xs: '1.05rem', sm: '1.25rem' } }}>
                                                {scrubbedPoint.pv_power?.toLocaleString()} <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>W</span>
                                            </Typography>
                                        </Box>
                                    </Grid>
                                    <Grid item xs={6} sm={4}>
                                        <Box sx={{ 
                                            p: { xs: 1, sm: 1.5 }, 
                                            borderRadius: 2.5, 
                                            bgcolor: darkMode ? 'rgba(99, 102, 241, 0.1)' : 'rgba(99, 102, 241, 0.08)',
                                            border: '1px solid rgba(99, 102, 241, 0.25)'
                                        }}>
                                            <Typography variant="caption" sx={{ color: '#6366f1', fontWeight: 700, display: 'block', mb: 0.2, fontSize: { xs: '0.68rem', sm: '0.75rem' } }}>
                                                ⚡ Home Load Power
                                            </Typography>
                                            <Typography variant="h6" sx={{ fontWeight: 800, color: '#6366f1', fontSize: { xs: '1.05rem', sm: '1.25rem' } }}>
                                                {scrubbedPoint.load_power?.toLocaleString()} <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>W</span>
                                            </Typography>
                                        </Box>
                                    </Grid>
                                    <Grid item xs={12} sm={4}>
                                        <Box sx={{ 
                                            p: { xs: 1, sm: 1.5 }, 
                                            borderRadius: 2.5, 
                                            bgcolor: scrubbedPoint.pv_power >= scrubbedPoint.load_power 
                                                ? (darkMode ? 'rgba(14, 165, 233, 0.1)' : 'rgba(14, 165, 233, 0.08)')
                                                : (darkMode ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.08)'),
                                            border: `1px solid ${scrubbedPoint.pv_power >= scrubbedPoint.load_power ? 'rgba(14, 165, 233, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`
                                        }}>
                                            <Typography variant="caption" sx={{ 
                                                color: scrubbedPoint.pv_power >= scrubbedPoint.load_power ? '#0ea5e9' : '#f59e0b', 
                                                fontWeight: 700, 
                                                display: 'block', 
                                                mb: 0.2,
                                                fontSize: { xs: '0.68rem', sm: '0.75rem' }
                                            }}>
                                                {scrubbedPoint.pv_power >= scrubbedPoint.load_power ? '🔄 Net Fed to Grid' : '🔌 Net Drawn from Grid'}
                                            </Typography>
                                            <Typography variant="h6" sx={{ 
                                                fontWeight: 800, 
                                                color: scrubbedPoint.pv_power >= scrubbedPoint.load_power ? '#0ea5e9' : '#f59e0b',
                                                fontSize: { xs: '1.05rem', sm: '1.25rem' } 
                                            }}>
                                                {scrubbedPoint.pv_power >= scrubbedPoint.load_power ? '+' : '-'}
                                                {Math.abs(scrubbedPoint.pv_power - scrubbedPoint.load_power).toLocaleString()} <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>W</span>
                                            </Typography>
                                        </Box>
                                    </Grid>
                                </Grid>
                            </Box>
                        ) : (
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                                    <Typography variant="body2" sx={{ fontWeight: 700, color: darkMode ? '#cbd5e1' : '#475569', display: 'flex', alignItems: 'center', gap: 0.8, fontSize: { xs: '0.8rem', sm: '0.875rem' } }}>
                                        <Speed sx={{ fontSize: 18, color: '#10b981' }} />
                                        Live Telemetry:
                                    </Typography>
                                    {maxPvPoint && maxPvPoint.pv_power > 0 && (
                                        <Chip 
                                            size="small"
                                            icon={<SolarIcon sx={{ fontSize: '14px !important', color: '#f59e0b !important' }} />}
                                            label={`Peak: ${maxPvPoint.pv_power} W (${maxPvPoint.time.slice(0, 5)})`}
                                            sx={{ 
                                                bgcolor: darkMode ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.1)',
                                                color: darkMode ? '#fbbf24' : '#d97706',
                                                fontWeight: 700,
                                                border: '1px solid rgba(245, 158, 11, 0.3)',
                                                fontSize: '0.74rem'
                                            }}
                                        />
                                    )}
                                    {data.length > 0 && (
                                        <Chip 
                                            size="small"
                                            icon={<ElectricBolt sx={{ fontSize: '14px !important', color: '#10b981 !important' }} />}
                                            label={`Latest: ${data[data.length - 1].pv_power} W (${data[data.length - 1].time.slice(0, 5)})`}
                                            sx={{ 
                                                bgcolor: darkMode ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.08)',
                                                color: '#10b981',
                                                fontWeight: 700,
                                                border: '1px solid rgba(16, 185, 129, 0.25)',
                                                fontSize: '0.74rem'
                                            }}
                                        />
                                    )}
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                                    <TouchApp sx={{ fontSize: 16, color: darkMode ? '#94a3b8' : '#64748b' }} />
                                    <Typography variant="caption" sx={{ color: darkMode ? '#94a3b8' : '#64748b', fontWeight: 500, fontStyle: 'italic' }}>
                                        {isMobile ? 'Drag finger across graph to inspect any time' : 'Hover over graph to inspect live values'}
                                    </Typography>
                                </Box>
                            </Box>
                        )}
                    </Box>

                    {isLoading ? (
                        <Box sx={{ display: "flex", flexDirection: 'column', justifyContent: "center", alignItems: "center", height: 400 }}>
                            <Refresh sx={{ 
                                animation: "spin 1s linear infinite", 
                                fontSize: 60, 
                                color: "#10b981",
                                mb: 2
                            }} />
                            <Typography variant="h6" sx={{ color: '#10b981', fontWeight: 600 }}>
                                Loading data...
                            </Typography>
                        </Box>
                    ) : (
                        <ResponsiveContainer width="100%" height={isMobile ? 330 : 450} minHeight={280}>
                            <AreaChart 
                                data={data} 
                                margin={{ top: 20, right: 10, left: -15, bottom: 20 }}
                                onMouseMove={(state) => {
                                    if (state && state.activePayload && state.activePayload.length) {
                                        setScrubbedPoint(state.activePayload[0].payload);
                                    }
                                }}
                                onTouchMove={(state) => {
                                    if (state && state.activePayload && state.activePayload.length) {
                                        setScrubbedPoint(state.activePayload[0].payload);
                                    }
                                }}
                            >
                                <defs>
                                    <linearGradient id="pvColor" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.85} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                                    </linearGradient>
                                    <linearGradient id="loadColor" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.85} />
                                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
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
                                        fill="rgba(239, 68, 68, 0.12)"
                                        stroke="rgba(239, 68, 68, 0.5)"
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

                                <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? "rgba(255, 255, 255, 0.07)" : "rgba(0, 0, 0, 0.06)"} />
                                <XAxis 
                                    dataKey="time" 
                                    tick={{ fill: darkMode ? '#94a3b8' : '#64748b', fontSize: isMobile ? 10 : 12 }}
                                    stroke={darkMode ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.15)"}
                                />
                                <YAxis 
                                    tickFormatter={(value) => `${value / 1000}k`}
                                    tick={{ fill: darkMode ? '#94a3b8' : '#64748b', fontSize: isMobile ? 10 : 12 }}
                                    stroke={darkMode ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.15)"}
                                />
                                <RechartsTooltip 
                                    content={<CustomTooltip />} 
                                    cursor={{ stroke: darkMode ? '#818cf8' : '#6366f1', strokeWidth: 1.5, strokeDasharray: '4 4' }}
                                />
                                <Legend 
                                    wrapperStyle={{ 
                                        paddingTop: '20px',
                                        fontSize: '13px',
                                        fontWeight: 600
                                    }}
                                />

                                <Area
                                    type="monotone"
                                    dataKey="pv_power"
                                    stroke="#10b981"
                                    strokeWidth={2.5}
                                    fillOpacity={1}
                                    fill="url(#pvColor)"
                                    name="PV Power (W)"
                                />
                                <Area
                                    type="monotone"
                                    dataKey="load_power"
                                    stroke="#6366f1"
                                    strokeWidth={2.5}
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
                                        fill="#f59e0b"
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

