import React, { useState } from "react";
import axios from "axios";
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    Legend
} from "recharts";
import {
    Box,
    Card,
    CardContent,
    Grid,
    InputAdornment,
    TextField,
    LinearProgress,
    Fade,
    IconButton,
    Button,
    Typography
} from "@mui/material";
import {
    SolarPower as SolarIcon,
    CalendarToday,
    Refresh,
    TrendingUp,
    BatteryChargingFull
} from "@mui/icons-material";
import { toast } from "react-toastify";
import { API_ENDPOINTS } from "../constants.js";

const MonthlyStats = ({ darkMode, themeColor, themeColors }) => {
    const today = new Date().toISOString().split("T")[0];
    const firstDay = new Date();
    firstDay.setDate(1);
    const defaultFrom = firstDay.toISOString().split("T")[0];

    const [fromDate, setFromDate] = useState(defaultFrom);
    const [toDate, setToDate] = useState(today);

    const [data, setData] = useState([]);
    const [totals, setTotals] = useState({
        production: '...',
        load: '...',
        saved: '...',
        feeded: '...',
    });
    const [isLoading, setIsLoading] = useState(false);
    const [missingDates, setMissingDates] = useState([]);
    const [isError, setisError] = useState("");
    const [progress, setProgress] = useState(0);
    const [isRefetching, setIsRefetching] = useState(false);
    const [refetchProgress, setRefetchProgress] = useState(0);
    
    const currentTheme = themeColors[themeColor];
    
    const fetchData = async () => {
        try {
            setTotals({
                production: '...',
                load: '...',
                saved: '...',
                feeded: '...',
            });
            setIsLoading(true);
            setProgress(0);

            const res = await axios.get(
                API_ENDPOINTS.getStatsRange(fromDate, toDate),
                {
                    onDownloadProgress: (progressEvent) => {
                        if (progressEvent.event.target.responseText) {
                            const chunks = progressEvent.event.target.responseText.trim().split('\n');
                            const lastChunk = chunks[chunks.length - 1];

                            try {
                                const data = JSON.parse(lastChunk);
                                if (data.success && data.progress !== undefined) {
                                    setProgress(data.progress);
                                }
                            } catch (e) {
                                // Ignore parsing errors for incomplete chunks
                            }
                        }
                    }
                }
            );
            console.log('res: ', res);
            
            const lines = res.data.trim().split('\n');
            const dailyStats = [];
            let finalTotals = { total_production_kwh: 0, total_load_kwh: 0 };

            for (const line of lines) {
                if (line.trim()) {
                    try {
                        const data = JSON.parse(line);
                        if (data.success) {
                            if (data.daily) {
                                dailyStats.push(data.daily);
                            }
                            if (data.total_production_kwh !== undefined) {
                                finalTotals.total_production_kwh = data.total_production_kwh;
                            }
                            if (data.total_load_kwh !== undefined) {
                                finalTotals.total_load_kwh = data.total_load_kwh;
                            }
                        }
                    } catch (e) {
                        console.error('Error parsing JSON chunk:', e);
                    }
                }
            }

            const dailyData = dailyStats.map((d) => {
                const isNull = (d.production_kwh === null || d.load_kwh === null);

                if (isNull) {
                    console.warn(`⚠️ No data for ${d.date}`);
                }

                return {
                    date: d.date,
                    production: isNull ? 0 : d.production_kwh,
                    load: isNull ? 0 : d.load_kwh,
                    saved: isNull ? 0 : Math.min(d.production_kwh, d.load_kwh),
                    feeded: isNull ? 0 : Math.max(0, d.production_kwh - d.load_kwh),
                    isNull
                };
            });

            setData(dailyData);

            const totalProd = finalTotals.total_production_kwh;
            const totalLoad = finalTotals.total_load_kwh;
            const saved = Math.min(totalProd, totalLoad);
            const feeded = Math.max(0, totalProd - totalLoad);

            setTotals({
                production: totalProd.toFixed(2),
                load: totalLoad.toFixed(2),
                saved: saved.toFixed(2),
                feeded: feeded.toFixed(2),
            });

            const nullDays = dailyData.filter(d => d.isNull).map(d => d.date);
            setMissingDates(nullDays);

            console.log('✅ Fetch completed successfully');
            console.log('📊 Daily data processed:', dailyData.length, 'days');
            console.log('⚠️ Missing data for:', nullDays.length, 'days:', nullDays);

        } catch (err) {
            setisError(err)
            toast.error("Error fetching API")
            console.error("Error fetching API:", err);
            setTotals({
                production: 0,
                load: 0,
                saved: 0,
                feeded: 0,
            });
        } finally {
            setIsLoading(false);
            setProgress(0);
        }
    };

    const refetchMissingDays = async () => {
        if (missingDates.length === 0) {
            toast.info('No missing dates to refetch');
            return;
        }

        try {
            setIsRefetching(true);
            setRefetchProgress(0);
            setisError("");

            console.log('🔄 Refetching missing dates:', missingDates);

            // Use fetch for streaming support
            const response = await fetch(API_ENDPOINTS.refetchMissingDates(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ dates: missingDates }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) {
                throw new Error('No response body reader available');
            }

            const refetchedData = [];
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();

                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');

                // Keep the last incomplete line in buffer
                buffer = lines.pop() || '';

                // Process complete lines
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const data = JSON.parse(line);
                            if (data.success) {
                                if (data.progress !== undefined) {
                                    setRefetchProgress(data.progress);
                                }
                                if (data.daily) {
                                    refetchedData.push(data.daily);
                                }
                            }
                        } catch (e) {
                            console.error('Error parsing JSON chunk:', e, 'Line:', line);
                        }
                    }
                }
            }

            // Process any remaining data in buffer
            if (buffer.trim()) {
                try {
                    const data = JSON.parse(buffer);
                    if (data.success && data.daily) {
                        refetchedData.push(data.daily);
                    }
                } catch (e) {
                    console.error('Error parsing final buffer:', e);
                }
            }

            // Update the data array with refetched values
            setData((prevData) => {
                const updatedData = [...prevData];
                refetchedData.forEach((refetched) => {
                    const index = updatedData.findIndex((d) => d.date === refetched.date);
                    if (index !== -1 && refetched.success) {
                        updatedData[index] = {
                            date: refetched.date,
                            production: refetched.production_kwh || 0,
                            load: refetched.load_kwh || 0,
                            saved: Math.min(refetched.production_kwh || 0, refetched.load_kwh || 0),
                            feeded: Math.max(0, (refetched.production_kwh || 0) - (refetched.load_kwh || 0)),
                            isNull: false,
                        };
                    }
                });
                return updatedData;
            });

            // Update totals
            const successfulRefetches = refetchedData.filter((d) => d.success);
            if (successfulRefetches.length > 0) {
                const newProduction = successfulRefetches.reduce((sum, d) => sum + (d.production_kwh || 0), 0);
                const newLoad = successfulRefetches.reduce((sum, d) => sum + (d.load_kwh || 0), 0);

                setTotals((prev) => {
                    const currentProd = parseFloat(prev.production) || 0;
                    const currentLoad = parseFloat(prev.load) || 0;
                    const saved = Math.min(currentProd + newProduction, currentLoad + newLoad);
                    const feeded = Math.max(0, (currentProd + newProduction) - (currentLoad + newLoad));

                    return {
                        production: (currentProd + newProduction).toFixed(2),
                        load: (currentLoad + newLoad).toFixed(2),
                        saved: saved.toFixed(2),
                        feeded: feeded.toFixed(2),
                    };
                });
            }

            // Update missing dates - remove successfully refetched dates
            const stillMissing = missingDates.filter((date) => {
                const refetched = refetchedData.find((d) => d.date === date);
                return !refetched || !refetched.success;
            });
            setMissingDates(stillMissing);

            const successCount = successfulRefetches.length;
            const failCount = refetchedData.length - successCount;

            if (successCount > 0) {
                toast.success(`Successfully refetched ${successCount} day(s)`);
            }
            if (failCount > 0) {
                toast.warning(`Failed to refetch ${failCount} day(s)`);
            }

            console.log('✅ Refetch completed:', { success: successCount, failed: failCount });

        } catch (err) {
            console.error("❌ Error refetching missing dates:", err);
            setisError(err.message || 'Error refetching data');
            toast.error("Error refetching data: " + (err.message || 'Unknown error'));
        } finally {
            setIsRefetching(false);
            setRefetchProgress(0);
        }
    };

    return (
        <Box>
            <Grid container spacing={{ xs: 1.5, sm: 2, md: 3 }} sx={{ mb: { xs: 2, sm: 3 } }}>
                <Grid item xs={12} sm={6} md={4}>
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
                            <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                                    <Typography variant="caption" sx={{ 
                                        color: darkMode ? '#94a3b8' : '#64748b', 
                                        textTransform: 'uppercase', 
                                        letterSpacing: 1.2,
                                        fontWeight: 700,
                                        fontSize: '0.72rem'
                                    }}>
                                        Total Production
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
                                        fontSize: { xs: '1.75rem', sm: '2.2rem' }
                                    }}>
                                        {totals.production}
                                    </Typography>
                                    <Typography variant="subtitle1" sx={{ color: '#10b981', fontWeight: 700 }}>
                                        kWh
                                    </Typography>
                                </Box>
                                <Typography variant="caption" sx={{ color: darkMode ? '#64748b' : '#94a3b8', display: 'block', fontWeight: 500 }}>
                                    Solar Generated in Period
                                </Typography>
                            </CardContent>
                        </Card>
                    </Fade>
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
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
                            <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                                    <Typography variant="caption" sx={{ 
                                        color: darkMode ? '#94a3b8' : '#64748b', 
                                        textTransform: 'uppercase', 
                                        letterSpacing: 1.2,
                                        fontWeight: 700,
                                        fontSize: '0.72rem'
                                    }}>
                                        Total Load
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
                                        fontSize: { xs: '1.75rem', sm: '2.2rem' }
                                    }}>
                                        {totals.load}
                                    </Typography>
                                    <Typography variant="subtitle1" sx={{ color: '#6366f1', fontWeight: 700 }}>
                                        kWh
                                    </Typography>
                                </Box>
                                <Typography variant="caption" sx={{ color: darkMode ? '#64748b' : '#94a3b8', display: 'block', fontWeight: 500 }}>
                                    Total Load Consumed
                                </Typography>
                            </CardContent>
                        </Card>
                    </Fade>
                </Grid>
                <Grid item xs={12} sm={12} md={4}>
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
                            <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                                    <Typography variant="caption" sx={{ 
                                        color: darkMode ? '#94a3b8' : '#64748b', 
                                        textTransform: 'uppercase', 
                                        letterSpacing: 1.2,
                                        fontWeight: 700,
                                        fontSize: '0.72rem'
                                    }}>
                                        Fed to Grid
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
                                        <BatteryChargingFull sx={{ fontSize: 22 }} />
                                    </Box>
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.8, mb: 0.5 }}>
                                    <Typography variant="h4" sx={{ 
                                        fontWeight: 800, 
                                        color: darkMode ? '#f8fafc' : '#0f172a',
                                        fontSize: { xs: '1.75rem', sm: '2.2rem' }
                                    }}>
                                        {totals.feeded}
                                    </Typography>
                                    <Typography variant="subtitle1" sx={{ color: '#0ea5e9', fontWeight: 700 }}>
                                        kWh
                                    </Typography>
                                </Box>
                                <Typography variant="caption" sx={{ color: darkMode ? '#64748b' : '#94a3b8', display: 'block', fontWeight: 500 }}>
                                    Net Feed-in Solar Surplus
                                </Typography>
                            </CardContent>
                        </Card>
                    </Fade>
                </Grid>
            </Grid>

            <Card sx={{
                borderRadius: 4,
                background: darkMode ? 'linear-gradient(145deg, #1e1e1e 0%, #2d2d2d 100%)' : 'linear-gradient(145deg, #ffffff 0%, #f8f9fa 100%)',
                boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
                border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`
            }}>
                <CardContent sx={{ p: { xs: 2, md: 4 } }}>
                    <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                        <TextField
                            label="From"
                            type="date"
                            value={fromDate}
                            onChange={(e) => setFromDate(e.target.value)}
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
                        <TextField
                            label="To"
                            type="date"
                            value={toDate}
                            onChange={(e) => setToDate(e.target.value)}
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
                            onClick={fetchData} 
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
                        <Button 
                            variant="contained" 
                            onClick={fetchData} 
                            disabled={isLoading}
                            sx={{
                                background: `linear-gradient(135deg, ${currentTheme.primary} 0%, ${currentTheme.secondary} 100%)`,
                                borderRadius: 3,
                                px: 4,
                                py: 1.5,
                                textTransform: 'none',
                                fontSize: '1rem',
                                fontWeight: 600,
                                boxShadow: `0 4px 15px ${currentTheme.primary}50`,
                                '&:hover': {
                                    background: `linear-gradient(135deg, ${currentTheme.secondary} 0%, ${currentTheme.primary} 100%)`,
                                    boxShadow: `0 6px 20px ${currentTheme.primary}40`,
                                }
                            }}
                        >
                            Confirm
                        </Button>
                    </Box>
                    {missingDates.length > 0 && (
                        <Box sx={{ mb: 2, p: 2, background: 'rgba(244, 67, 54, 0.1)', borderRadius: 2 }}>
                            <Typography variant="body2" color="error" sx={{ mb: 1 }}>
                                ⚠️ Missing data for: {missingDates.join(", ")}
                            </Typography>
                            <Button
                                variant="contained"
                                color="warning"
                                onClick={refetchMissingDays}
                                disabled={isRefetching || isLoading}
                                startIcon={<Refresh />}
                                sx={{
                                    mt: 1,
                                    borderRadius: 2,
                                    textTransform: 'none',
                                    fontWeight: 600,
                                }}
                            >
                                {isRefetching ? `Refetching... ${refetchProgress.toFixed(0)}%` : `Refetch Missing Days (${missingDates.length})`}
                            </Button>
                            {isRefetching && (
                                <Box sx={{ width: '100%', mt: 2 }}>
                                    <LinearProgress
                                        variant="determinate"
                                        value={refetchProgress}
                                        sx={{
                                            height: 8,
                                            borderRadius: 4,
                                            '& .MuiLinearProgress-bar': {
                                                borderRadius: 4,
                                            }
                                        }}
                                    />
                                </Box>
                            )}
                        </Box>
                    )}
                    {isError && (
                        <Typography variant="body2" color="error" sx={{ mb: 2, p: 2, background: 'rgba(244, 67, 54, 0.1)', borderRadius: 2 }}>
                            ⚠️ Error: {isError}
                        </Typography>
                    )}
                    {isLoading ? (
                        <Box sx={{ width: '100%', mb: 2 }}>
                            <LinearProgress
                                variant="determinate"
                                value={progress}
                                sx={{ 
                                    height: 12, 
                                    borderRadius: 6,
                                    background: `rgba(${currentTheme.primary}, 0.1)`,
                                    '& .MuiLinearProgress-bar': {
                                        background: `linear-gradient(135deg, ${currentTheme.primary} 0%, ${currentTheme.secondary} 100%)`,
                                        borderRadius: 6,
                                    }
                                }}
                            />
                            <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 2, fontWeight: 500, fontSize: '1rem' }}>
                                Loading... {progress.toFixed(0)}%
                            </Typography>
                        </Box>
                    ) : (
                        <ResponsiveContainer width="100%" height={450}>
                            <AreaChart data={data}
                                margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="prodColor" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.85} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                                    </linearGradient>
                                    <linearGradient id="loadColor" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.85} />
                                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? "rgba(255, 255, 255, 0.07)" : "rgba(0, 0, 0, 0.06)"} />
                                <XAxis 
                                    dataKey="date" 
                                    tick={{ fill: darkMode ? '#94a3b8' : '#64748b', fontSize: 12 }}
                                    stroke={darkMode ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.15)"}
                                />
                                <YAxis 
                                    width={40} 
                                    tickFormatter={(value) => `${value}k`}
                                    tick={{ fill: darkMode ? '#94a3b8' : '#64748b', fontSize: 12 }}
                                    stroke={darkMode ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.15)"}
                                />
                                <RechartsTooltip 
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
                                    dataKey="production"
                                    stroke="#10b981"
                                    strokeWidth={2.5}
                                    fillOpacity={1}
                                    fill="url(#prodColor)"
                                    name="Production (kWh)"
                                />
                                <Area
                                    type="monotone"
                                    dataKey="load"
                                    stroke="#6366f1"
                                    strokeWidth={2.5}
                                    fillOpacity={1}
                                    fill="url(#loadColor)"
                                    name="Load (kWh)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>
        </Box>
    );
};

export default MonthlyStats;
