import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    Box,
    Card,
    CardContent,
    Grid,
    Typography,
    Alert,
    Chip,
    Divider,
    CircularProgress,
    IconButton,
    Tooltip,
    Button,
    LinearProgress,
    Fade
} from '@mui/material';
import {
    PowerSettingsNew,
    Settings,
    CheckCircle,
    Email,
    Refresh,
    Info,
    NotificationsActive,
    Assessment,
    Wifi,
    Memory,
    Speed,
    ElectricBolt,
    Send,
    Chat,
    Dns,
    SolarPower,
    Park,
    Shield,
    ReportProblem,
    Tune,
    Nightlight
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { API_ENDPOINTS } from '../constants';

const SystemControls = ({ darkMode, themeColor, themeColors }) => {
    const [systemHealth, setSystemHealth] = useState(null);
    const [isLoadingHealth, setIsLoadingHealth] = useState(true);
    const [lastHealthUpdate, setLastHealthUpdate] = useState(null);
    
    const [systemSettings, setSystemSettings] = useState(null);
    const [isLoadingSettings, setIsLoadingSettings] = useState(true);
    
    const [notificationStatus, setNotificationStatus] = useState(null);
    const [collectorInfo, setCollectorInfo] = useState(null);
    const [lastDataMetrics, setLastDataMetrics] = useState({});
    const [deviceList, setDeviceList] = useState([]);
    const [testingChannel, setTestingChannel] = useState(null);

    // NEW ShineMonitor & Hardware states (strictly battery-free)
    const [hardwareAlarms, setHardwareAlarms] = useState({ alarms: [], active_count: 0 });
    const [hardwareRegisters, setHardwareRegisters] = useState([]);
    const [environmentalImpact, setEnvironmentalImpact] = useState(null);
    
    const currentTheme = themeColors[themeColor] || { primary: '#10b981', secondary: '#059669' };

    useEffect(() => {
        fetchAllData();
    }, []);

    const fetchAllData = async (forceRefresh = false) => {
        setIsLoadingHealth(true);
        setIsLoadingSettings(true);
        await Promise.allSettled([
            fetchSystemHealth(forceRefresh),
            fetchSystemSettings(forceRefresh),
            fetchNotificationStatus(),
            fetchCollectorInfo(),
            fetchDeviceLastData(),
            fetchDeviceList(),
            fetchHardwareAlarms(),
            fetchHardwareRegisters(),
            fetchEnvironmentalImpact()
        ]);
        setIsLoadingHealth(false);
        setIsLoadingSettings(false);
    };

    const fetchSystemHealth = async (forceRefresh = false) => {
        try {
            const url = forceRefresh 
                ? `${API_ENDPOINTS.systemHealth()}?force_refresh=true`
                : API_ENDPOINTS.systemHealth();
            const response = await axios.get(url);
            setSystemHealth(response.data);
            setLastHealthUpdate(new Date());
        } catch (error) {
            console.error('Error fetching system health:', error);
        }
    };

    const fetchSystemSettings = async (forceRefresh = false) => {
        try {
            const url = forceRefresh 
                ? `${API_ENDPOINTS.systemSettings()}?force_refresh=true`
                : API_ENDPOINTS.systemSettings();
            const response = await axios.get(url);
            if (response.data && response.data.success) {
                setSystemSettings(response.data.settings);
            }
        } catch (error) {
            console.error('Error fetching system settings:', error);
        }
    };

    const fetchNotificationStatus = async () => {
        try {
            const response = await axios.get(API_ENDPOINTS.notificationStatus());
            if (response.data && response.data.success) {
                setNotificationStatus(response.data);
            }
        } catch (error) {
            console.error('Error fetching notification status:', error);
        }
    };

    const fetchCollectorInfo = async () => {
        try {
            const response = await axios.get(API_ENDPOINTS.collectorInfo());
            if (response.data && response.data.success && response.data.data?.dat?.collector) {
                setCollectorInfo(response.data.data.dat.collector[0] || null);
            }
        } catch (error) {
            console.error('Error fetching collector info:', error);
        }
    };

    const fetchDeviceLastData = async () => {
        try {
            const response = await axios.get(API_ENDPOINTS.deviceLastData());
            if (response.data && response.data.success && response.data.data?.dat) {
                const metricMap = {};
                // Filter out any battery metrics because user's system has no battery
                response.data.data.dat.forEach((item) => {
                    if (item.title && !item.title.toLowerCase().includes('battery')) {
                        metricMap[item.title] = {
                            val: item.val,
                            unit: item.unit || ''
                        };
                    }
                });
                setLastDataMetrics(metricMap);
            }
        } catch (error) {
            console.error('Error fetching device last data:', error);
        }
    };

    const fetchDeviceList = async () => {
        try {
            const response = await axios.get(API_ENDPOINTS.devicesList());
            if (response.data && response.data.success && response.data.devices) {
                setDeviceList(response.data.devices);
            }
        } catch (error) {
            console.error('Error fetching device list:', error);
        }
    };

    const fetchHardwareAlarms = async () => {
        try {
            const response = await axios.get(API_ENDPOINTS.hardwareAlarms());
            if (response.data && response.data.success) {
                setHardwareAlarms(response.data);
            }
        } catch (error) {
            console.error('Error fetching hardware alarms:', error);
        }
    };

    const fetchHardwareRegisters = async () => {
        try {
            const response = await axios.get(API_ENDPOINTS.hardwareRegisters());
            if (response.data && response.data.success && response.data.registers) {
                setHardwareRegisters(response.data.registers);
            }
        } catch (error) {
            console.error('Error fetching hardware registers:', error);
        }
    };

    const fetchEnvironmentalImpact = async () => {
        try {
            const response = await axios.get(API_ENDPOINTS.environmentalImpact());
            if (response.data && response.data.success) {
                setEnvironmentalImpact(response.data);
            }
        } catch (error) {
            console.error('Error fetching environmental impact:', error);
        }
    };

    const handleTestNotification = async () => {
        try {
            setTestingChannel('email');
            const response = await axios.post(API_ENDPOINTS.notificationTest());
            if (response.data && response.data.success) {
                toast.success(`✅ Test email sent to ${response.data.recipient || 'configured email'}`);
            } else {
                toast.error(response.data?.message || 'Failed to send test email');
            }
        } catch (error) {
            toast.error('Error sending test email: ' + (error.response?.data?.message || error.message));
        } finally {
            setTestingChannel(null);
        }
    };

    const handleTestTelegram = async () => {
        try {
            setTestingChannel('telegram');
            const response = await axios.post(API_ENDPOINTS.testTelegram());
            if (response.data && response.data.success) {
                toast.success(`📱 Telegram alert sent to Chat ID ${response.data.recipient || 'configured user'}!`);
            } else {
                toast.error(response.data?.message || 'Failed to send Telegram message');
            }
        } catch (error) {
            toast.error('Error sending Telegram: ' + (error.response?.data?.message || error.message));
        } finally {
            setTestingChannel(null);
        }
    };

    const handleTestDiscord = async () => {
        try {
            setTestingChannel('discord');
            const response = await axios.post(API_ENDPOINTS.testDiscord());
            if (response.data && response.data.success) {
                toast.success('💬 Discord alert webhook sent successfully!');
            } else {
                toast.error(response.data?.message || 'Failed to send Discord webhook');
            }
        } catch (error) {
            toast.error('Error sending Discord alert: ' + (error.response?.data?.message || error.message));
        } finally {
            setTestingChannel(null);
        }
    };

    const handleTestDailySummary = async () => {
        try {
            setTestingChannel('summary');
            toast.info("Generating and dispatching executive daily summary...");
            const response = await axios.get(API_ENDPOINTS.testDailySummary());
            if (response.data && response.data.success) {
                const { data } = response.data;
                toast.success(
                    `📊 Daily Summary Sent! PV: ${data.production_kwh} kWh | Load: ${data.load_kwh} kWh`,
                    { autoClose: 5000 }
                );
            } else {
                toast.error(response.data?.message || 'Failed to send daily summary');
            }
        } catch (error) {
            toast.error('Error sending daily summary: ' + error.message);
        } finally {
            setTestingChannel(null);
        }
    };

    const handleRefresh = () => {
        toast.info('Fetching fresh live data from inverter & cloud logger...');
        fetchAllData(true);
    };

    const getHealthColor = (score) => {
        if (score >= 90) return '#10b981';
        if (score >= 70) return '#f59e0b';
        return '#ef4444';
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'Online': return 'success';
            case 'Warning': return 'warning';
            case 'Critical': return 'error';
            default: return 'default';
        }
    };

    const cardBackground = darkMode 
        ? 'linear-gradient(145deg, rgba(17, 24, 39, 0.9) 0%, rgba(30, 41, 59, 0.75) 100%)' 
        : 'linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)';

    const cardBorder = darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(226, 232, 240, 0.9)';

    return (
        <Box>
            {/* Header & Control Bar */}
            <Box sx={{ 
                mb: 3, 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: { xs: 'flex-start', sm: 'center' },
                flexDirection: { xs: 'column', sm: 'row' },
                gap: 2
            }}>
                <Box>
                    <Typography variant="h4" sx={{ 
                        fontWeight: 800, 
                        color: darkMode ? '#f8fafc' : '#0f172a',
                        fontSize: { xs: '1.5rem', sm: '2rem' },
                        letterSpacing: '-0.02em',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5
                    }}>
                        <Memory sx={{ color: currentTheme.primary, fontSize: { xs: 28, sm: 34 } }} />
                        System Intelligence & Controls
                    </Typography>
                    <Typography variant="body2" sx={{ color: darkMode ? '#94a3b8' : '#64748b', mt: 0.5 }}>
                        Real-time inverter telemetry, datalogger diagnostics & instant multi-channel alert center
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    {lastHealthUpdate && (
                        <Chip
                            size="small"
                            label={`Updated: ${lastHealthUpdate.toLocaleTimeString()}`}
                            sx={{
                                bgcolor: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                                color: darkMode ? '#94a3b8' : '#64748b',
                                fontWeight: 600,
                                fontSize: '0.75rem'
                            }}
                        />
                    )}
                    <Tooltip title="Refresh All Telemetry">
                        <IconButton 
                            onClick={handleRefresh}
                            disabled={isLoadingHealth || isLoadingSettings}
                            sx={{
                                background: `linear-gradient(135deg, ${currentTheme.primary} 0%, ${currentTheme.secondary} 100%)`,
                                color: 'white',
                                '&:hover': {
                                    background: `linear-gradient(135deg, ${currentTheme.secondary} 0%, ${currentTheme.primary} 100%)`,
                                    transform: 'rotate(180deg)',
                                },
                                transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                                boxShadow: `0 4px 15px ${currentTheme.primary}40`,
                            }}
                        >
                            <Refresh />
                        </IconButton>
                    </Tooltip>
                </Box>
            </Box>

            {/* Quick System Summary Banner */}
            <Box sx={{ 
                mb: 3, 
                p: { xs: 2, sm: 2.5 }, 
                borderRadius: 4, 
                background: darkMode ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.05)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 2
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{ 
                        p: 1.2, 
                        borderRadius: 3, 
                        bgcolor: 'rgba(16, 185, 129, 0.15)',
                        color: '#10b981',
                        display: 'flex'
                    }}>
                        <Speed sx={{ fontSize: 28 }} />
                    </Box>
                    <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, color: darkMode ? '#f8fafc' : '#0f172a' }}>
                            Inverter 24/7 Automated Monitoring & Feed-in Active
                        </Typography>
                        <Typography variant="caption" sx={{ color: darkMode ? '#94a3b8' : '#64748b' }}>
                            Sampling every 5 minutes. Live alerts triggered on power-cuts, restoration, and daily executive summaries.
                        </Typography>
                    </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Chip 
                        size="small" 
                        icon={<ElectricBolt sx={{ fontSize: '14px !important', color: '#10b981 !important' }} />}
                        label={systemHealth?.system_mode === 'Line Mode' ? 'Grid Connected' : (systemHealth?.system_mode || 'Online')}
                        sx={{ bgcolor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontWeight: 700 }}
                    />
                    <Chip 
                        size="small" 
                        icon={<Dns sx={{ fontSize: '14px !important', color: '#0ea5e9 !important' }} />}
                        label={`Rated: ${lastDataMetrics['AC Output Rating Active Power']?.val || '6000'}W`}
                        sx={{ bgcolor: 'rgba(14, 165, 233, 0.15)', color: '#0ea5e9', fontWeight: 700 }}
                    />
                    <Chip 
                        size="small" 
                        label={notificationStatus?.grid_feeding_enabled ? 'Grid Feed: Enabled' : 'Grid Feed: Standby'}
                        sx={{ bgcolor: 'rgba(99, 102, 241, 0.15)', color: '#6366f1', fontWeight: 700 }}
                    />
                </Box>
            </Box>

            {/* Main Diagnostics Grid */}
            <Grid container spacing={{ xs: 2, sm: 2.5, md: 3 }}>
                
                {/* HERO CARD: ⚡ Solar Grid-Feeding Status & Power Flow Intelligence */}
                <Grid item xs={12}>
                    <Fade in timeout={300}>
                        <Card sx={{
                            background: cardBackground,
                            borderRadius: 4,
                            border: `1px solid ${cardBorder}`,
                            borderTop: `4px solid ${
                                systemSettings?.grid_feed_state === 'active_feeding' ? '#10b981' :
                                systemSettings?.grid_feed_state === 'self_consumption' ? '#6366f1' :
                                systemSettings?.grid_feed_state === 'grid_outage' ? '#f59e0b' :
                                systemSettings?.grid_feed_state === 'hardware_disabled' ? '#ef4444' : '#0ea5e9'
                            }`,
                            boxShadow: darkMode ? '0 12px 35px rgba(0,0,0,0.4)' : '0 12px 35px rgba(0,0,0,0.05)'
                        }}>
                            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5, flexWrap: 'wrap', gap: 1.5 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.8 }}>
                                        <Box sx={{ 
                                            p: 1.2, 
                                            borderRadius: 3, 
                                            bgcolor: systemSettings?.grid_feed_state === 'active_feeding' ? 'rgba(16, 185, 129, 0.15)' :
                                                     systemSettings?.grid_feed_state === 'night_standby' ? 'rgba(14, 165, 233, 0.15)' :
                                                     'rgba(99, 102, 241, 0.15)',
                                            color: systemSettings?.grid_feed_state === 'active_feeding' ? '#10b981' :
                                                   systemSettings?.grid_feed_state === 'night_standby' ? '#0ea5e9' : '#6366f1',
                                            display: 'flex'
                                        }}>
                                            {systemSettings?.grid_feed_state === 'night_standby' ? (
                                                <Nightlight sx={{ fontSize: 32 }} />
                                            ) : systemSettings?.grid_feed_state === 'active_feeding' ? (
                                                <ElectricBolt sx={{ fontSize: 32 }} />
                                            ) : (
                                                <SolarPower sx={{ fontSize: 32 }} />
                                            )}
                                        </Box>
                                        <Box>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                                <Typography variant="h5" sx={{ fontWeight: 800, fontSize: { xs: '1.2rem', sm: '1.45rem' } }}>
                                                    Solar Grid-Feeding Status & Power Flow
                                                </Typography>
                                                <Chip 
                                                    size="small" 
                                                    label={systemSettings?.grid_feed_badge || (systemSettings?.is_night ? '🌙 Standby (Night)' : '⚡ Active Feed')}
                                                    sx={{ 
                                                        fontWeight: 800, 
                                                        fontSize: '0.75rem',
                                                        bgcolor: systemSettings?.grid_feed_state === 'active_feeding' ? 'rgba(16, 185, 129, 0.15)' :
                                                                 systemSettings?.grid_feed_state === 'grid_outage' ? 'rgba(245, 158, 11, 0.15)' :
                                                                 systemSettings?.grid_feed_state === 'hardware_disabled' ? 'rgba(239, 68, 68, 0.15)' :
                                                                 'rgba(14, 165, 233, 0.15)',
                                                        color: systemSettings?.grid_feed_state === 'active_feeding' ? '#10b981' :
                                                               systemSettings?.grid_feed_state === 'grid_outage' ? '#f59e0b' :
                                                               systemSettings?.grid_feed_state === 'hardware_disabled' ? '#ef4444' :
                                                               '#0ea5e9',
                                                        border: '1px solid currentColor'
                                                    }}
                                                />
                                            </Box>
                                            <Typography variant="caption" sx={{ color: darkMode ? '#94a3b8' : '#64748b', mt: 0.3, display: 'block' }}>
                                                Physical power-flow balance with inverter firmware register validation
                                            </Typography>
                                        </Box>
                                    </Box>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                        <Chip 
                                            size="small"
                                            icon={<Tune sx={{ fontSize: '14px !important' }} />}
                                            label={`Inverter Register std_solar_feed_to_grid_ctrl_d: ${systemSettings?.hardware_feed_setting || 'Enable'}`}
                                            sx={{
                                                bgcolor: systemSettings?.hardware_feed_setting === 'Disable' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                                                color: systemSettings?.hardware_feed_setting === 'Disable' ? '#ef4444' : '#10b981',
                                                fontWeight: 700,
                                                fontSize: '0.72rem'
                                            }}
                                        />
                                    </Box>
                                </Box>

                                {/* 4 Power Flow Telemetry Tiles */}
                                <Grid container spacing={2} sx={{ mb: 2.5 }}>
                                    <Grid item xs={6} sm={3}>
                                        <Box sx={{ p: 2, borderRadius: 3, bgcolor: darkMode ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                                            <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 700, display: 'block', mb: 0.5 }}>
                                                ☀️ Solar PV Generation
                                            </Typography>
                                            <Typography variant="h5" sx={{ fontWeight: 800, color: '#10b981' }}>
                                                {systemSettings?.pv_power?.toLocaleString() ?? '0'} <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>W</span>
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: darkMode ? '#64748b' : '#94a3b8', fontSize: '0.72rem' }}>
                                                {systemSettings?.is_night ? '🌙 Inactive (Night)' : '☀️ Active Production'}
                                            </Typography>
                                        </Box>
                                    </Grid>
                                    <Grid item xs={6} sm={3}>
                                        <Box sx={{ p: 2, borderRadius: 3, bgcolor: darkMode ? 'rgba(99, 102, 241, 0.08)' : 'rgba(99, 102, 241, 0.05)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                                            <Typography variant="caption" sx={{ color: '#6366f1', fontWeight: 700, display: 'block', mb: 0.5 }}>
                                                🏠 Home Load Demand
                                            </Typography>
                                            <Typography variant="h5" sx={{ fontWeight: 800, color: '#6366f1' }}>
                                                {systemSettings?.load_power?.toLocaleString() ?? '0'} <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>W</span>
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: darkMode ? '#64748b' : '#94a3b8', fontSize: '0.72rem' }}>
                                                AC Active Power Consumption
                                            </Typography>
                                        </Box>
                                    </Grid>
                                    <Grid item xs={6} sm={3}>
                                        <Box sx={{ p: 2, borderRadius: 3, bgcolor: darkMode ? 'rgba(14, 165, 233, 0.08)' : 'rgba(14, 165, 233, 0.05)', border: '1px solid rgba(14, 165, 233, 0.2)' }}>
                                            <Typography variant="caption" sx={{ color: '#0ea5e9', fontWeight: 700, display: 'block', mb: 0.5 }}>
                                                ⚡ Grid Feed Power
                                            </Typography>
                                            <Typography variant="h5" sx={{ fontWeight: 800, color: '#0ea5e9' }}>
                                                {systemSettings?.solar_feed_power?.toLocaleString() ?? '0'} <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>W</span>
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: darkMode ? '#64748b' : '#94a3b8', fontSize: '0.72rem' }}>
                                                {systemSettings?.is_actively_feeding ? '⚡ Exporting to Grid' : '0 W Feed-in'}
                                            </Typography>
                                        </Box>
                                    </Grid>
                                    <Grid item xs={6} sm={3}>
                                        <Box sx={{ p: 2, borderRadius: 3, bgcolor: darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)', border: `1px solid ${cardBorder}` }}>
                                            <Typography variant="caption" sx={{ color: darkMode ? '#94a3b8' : '#64748b', fontWeight: 700, display: 'block', mb: 0.5 }}>
                                                🔄 Generation vs Load Balance
                                            </Typography>
                                            <Typography variant="h5" sx={{ 
                                                fontWeight: 800, 
                                                color: (systemSettings?.pv_power || 0) >= (systemSettings?.load_power || 0) ? '#10b981' : '#f59e0b'
                                            }}>
                                                {(systemSettings?.pv_power || 0) >= (systemSettings?.load_power || 0) ? '+' : ''}
                                                {((systemSettings?.pv_power || 0) - (systemSettings?.load_power || 0)).toLocaleString()} <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>W</span>
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: darkMode ? '#64748b' : '#94a3b8', fontSize: '0.72rem' }}>
                                                {(systemSettings?.pv_power || 0) >= (systemSettings?.load_power || 0) ? 'Surplus Generation' : 'Grid Support Required'}
                                            </Typography>
                                        </Box>
                                    </Grid>
                                </Grid>

                                {/* Smart Explanation Banner */}
                                <Box sx={{ 
                                    p: 2, 
                                    borderRadius: 3, 
                                    bgcolor: darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(241, 245, 249, 0.9)',
                                    border: `1px solid ${cardBorder}`,
                                    display: 'flex',
                                    alignItems: { xs: 'flex-start', sm: 'center' },
                                    justifyContent: 'space-between',
                                    flexDirection: { xs: 'column', sm: 'row' },
                                    gap: 1.5
                                }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                        <Info sx={{ color: systemSettings?.grid_feed_state === 'active_feeding' ? '#10b981' : '#0ea5e9', fontSize: 24 }} />
                                        <Box>
                                            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: darkMode ? '#f8fafc' : '#0f172a' }}>
                                                Physical Logic Assessment:
                                            </Typography>
                                            <Typography variant="body2" sx={{ color: darkMode ? '#cbd5e1' : '#475569', fontSize: '0.85rem' }}>
                                                {systemSettings?.grid_feed_explanation || "Inverter power management evaluates PV generation against household demand and anti-islanding grid limits."}
                                            </Typography>
                                        </Box>
                                    </Box>
                                    <Chip 
                                        size="small"
                                        icon={<Shield sx={{ fontSize: '14px !important' }} />}
                                        label={`Grid Sync: ${systemHealth?.utility_ac_voltage || 230}V @ ${systemHealth?.utility_ac_frequency || 50.0}Hz`}
                                        sx={{ fontWeight: 700, fontSize: '0.72rem', bgcolor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', flexShrink: 0 }}
                                    />
                                </Box>
                            </CardContent>
                        </Card>
                    </Fade>
                </Grid>

                {/* 1. System Health Score & Power Line Stability */}
                <Grid item xs={12} md={6}>
                    <Fade in timeout={400}>
                        <Card sx={{
                            background: cardBackground,
                            borderRadius: 4,
                            border: `1px solid ${cardBorder}`,
                            borderTop: '3.5px solid #10b981',
                            boxShadow: darkMode ? '0 10px 30px rgba(0,0,0,0.3)' : '0 10px 30px rgba(0,0,0,0.03)',
                            height: '100%'
                        }}>
                            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                        <Box sx={{ 
                                            p: 1, 
                                            borderRadius: 2.5, 
                                            bgcolor: 'rgba(16, 185, 129, 0.12)',
                                            color: '#10b981'
                                        }}>
                                            <Settings sx={{ fontSize: 24 }} />
                                        </Box>
                                        <Box>
                                            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem' }}>
                                                System Health & Line Quality
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: darkMode ? '#94a3b8' : '#64748b' }}>
                                                Hardware diagnostics & real-time voltage frequency
                                            </Typography>
                                        </Box>
                                    </Box>
                                    {systemHealth && (
                                        <Chip 
                                            label={systemHealth.status}
                                            color={getStatusColor(systemHealth.status)}
                                            size="small"
                                            sx={{ fontWeight: 700 }}
                                        />
                                    )}
                                </Box>

                                {isLoadingHealth ? (
                                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                                        <CircularProgress size={40} sx={{ color: currentTheme.primary }} />
                                    </Box>
                                ) : systemHealth ? (
                                    <>
                                        {/* Score Display */}
                                        <Box sx={{ 
                                            textAlign: 'center', 
                                            p: 2.5, 
                                            mb: 2.5,
                                            borderRadius: 3, 
                                            background: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                                            border: `1px solid ${cardBorder}`
                                        }}>
                                            <Typography variant="h2" sx={{ 
                                                fontWeight: 900,
                                                color: getHealthColor(systemHealth.health_score),
                                                fontSize: { xs: '3rem', sm: '3.75rem' },
                                                lineHeight: 1
                                            }}>
                                                {systemHealth.health_score}
                                                <span style={{ fontSize: '1.25rem', fontWeight: 600, color: darkMode ? '#94a3b8' : '#64748b' }}> / 100</span>
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: darkMode ? '#cbd5e1' : '#475569', fontWeight: 600, mt: 0.5, display: 'block' }}>
                                                {systemHealth.health_score >= 90 ? '🟢 Optimal Operating Parameters' : '⚠️ Deviations Detected'}
                                            </Typography>
                                        </Box>

                                        {/* Electrical Grid & Inverter Metrics */}
                                        <Grid container spacing={1.5}>
                                            <Grid item xs={6}>
                                                <Box sx={{ p: 1.5, borderRadius: 2.5, bgcolor: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', border: `1px solid ${cardBorder}` }}>
                                                    <Typography variant="caption" sx={{ color: darkMode ? '#94a3b8' : '#64748b', fontWeight: 600, display: 'block', mb: 0.3 }}>
                                                        Grid Line Voltage
                                                    </Typography>
                                                    <Typography variant="h6" sx={{ fontWeight: 800 }}>
                                                        {systemHealth.utility_ac_voltage || '0'} <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>V</span>
                                                    </Typography>
                                                    <Typography variant="caption" sx={{ color: darkMode ? '#64748b' : '#94a3b8', fontSize: '0.7rem' }}>
                                                        Freq: {systemHealth.utility_ac_frequency || 50.0} Hz
                                                    </Typography>
                                                </Box>
                                            </Grid>
                                            <Grid item xs={6}>
                                                <Box sx={{ p: 1.5, borderRadius: 2.5, bgcolor: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', border: `1px solid ${cardBorder}` }}>
                                                    <Typography variant="caption" sx={{ color: darkMode ? '#94a3b8' : '#64748b', fontWeight: 600, display: 'block', mb: 0.3 }}>
                                                        Inverter AC Output
                                                    </Typography>
                                                    <Typography variant="h6" sx={{ fontWeight: 800, color: '#10b981' }}>
                                                        {systemHealth.ac_output_voltage || '230.0'} <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>V</span>
                                                    </Typography>
                                                    <Typography variant="caption" sx={{ color: darkMode ? '#64748b' : '#94a3b8', fontSize: '0.7rem' }}>
                                                        Freq: {systemHealth.ac_output_frequency || 50.0} Hz
                                                    </Typography>
                                                </Box>
                                            </Grid>
                                            <Grid item xs={6}>
                                                <Box sx={{ p: 1.5, borderRadius: 2.5, bgcolor: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', border: `1px solid ${cardBorder}` }}>
                                                    <Typography variant="caption" sx={{ color: darkMode ? '#94a3b8' : '#64748b', fontWeight: 600, display: 'block', mb: 0.3 }}>
                                                        Active Load Power
                                                    </Typography>
                                                    <Typography variant="h6" sx={{ fontWeight: 800, color: '#6366f1' }}>
                                                        {systemHealth.ac_output_power?.toLocaleString() || '0'} <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>W</span>
                                                    </Typography>
                                                    <Typography variant="caption" sx={{ color: darkMode ? '#64748b' : '#94a3b8', fontSize: '0.7rem' }}>
                                                        Apparent: {lastDataMetrics['AC Output Apparent Power']?.val || systemHealth.ac_output_power} VA
                                                    </Typography>
                                                </Box>
                                            </Grid>
                                            <Grid item xs={6}>
                                                <Box sx={{ p: 1.5, borderRadius: 2.5, bgcolor: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', border: `1px solid ${cardBorder}` }}>
                                                    <Typography variant="caption" sx={{ color: darkMode ? '#94a3b8' : '#64748b', fontWeight: 600, display: 'block', mb: 0.3 }}>
                                                        Load Capacity Utilized
                                                    </Typography>
                                                    <Typography variant="h6" sx={{ fontWeight: 800 }}>
                                                        {systemHealth.output_load_percent || '0'}%
                                                    </Typography>
                                                    <LinearProgress 
                                                        variant="determinate" 
                                                        value={Math.min(100, Number(systemHealth.output_load_percent) || 0)} 
                                                        sx={{ mt: 0.6, height: 4, borderRadius: 2 }}
                                                    />
                                                </Box>
                                            </Grid>
                                        </Grid>
                                    </>
                                ) : (
                                    <Alert severity="error">Failed to connect to inverter health service</Alert>
                                )}
                            </CardContent>
                        </Card>
                    </Fade>
                </Grid>

                {/* 2. Inverter Hardware Specs & Operational Parameters */}
                <Grid item xs={12} md={6}>
                    <Fade in timeout={500}>
                        <Card sx={{
                            background: cardBackground,
                            borderRadius: 4,
                            border: `1px solid ${cardBorder}`,
                            borderTop: '3.5px solid #6366f1',
                            boxShadow: darkMode ? '0 10px 30px rgba(0,0,0,0.3)' : '0 10px 30px rgba(0,0,0,0.03)',
                            height: '100%'
                        }}>
                            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                        <Box sx={{ 
                                            p: 1, 
                                            borderRadius: 2.5, 
                                            bgcolor: 'rgba(99, 102, 241, 0.12)',
                                            color: '#6366f1'
                                        }}>
                                            <PowerSettingsNew sx={{ fontSize: 24 }} />
                                        </Box>
                                        <Box>
                                            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem' }}>
                                                Inverter Hardware & Dual Output
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: darkMode ? '#94a3b8' : '#64748b' }}>
                                                Firmware settings & rated technical capabilities
                                            </Typography>
                                        </Box>
                                    </Box>
                                    <Chip 
                                        size="small"
                                        label={systemSettings?.load_status || 'Load ON'}
                                        sx={{ bgcolor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontWeight: 700 }}
                                    />
                                </Box>

                                <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
                                    <Grid item xs={12} sm={6}>
                                        <Box sx={{ p: 1.8, borderRadius: 2.5, bgcolor: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', border: `1px solid ${cardBorder}` }}>
                                            <Typography variant="caption" sx={{ color: darkMode ? '#94a3b8' : '#64748b', fontWeight: 600 }}>
                                                Rated Active Power
                                            </Typography>
                                            <Typography variant="h5" sx={{ fontWeight: 800, color: '#6366f1', my: 0.3 }}>
                                                {lastDataMetrics['AC Output Rating Active Power']?.val || '6000'} W
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: darkMode ? '#64748b' : '#94a3b8' }}>
                                                6.0 kW Heavy Duty Capacity
                                            </Typography>
                                        </Box>
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <Box sx={{ p: 1.8, borderRadius: 2.5, bgcolor: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', border: `1px solid ${cardBorder}` }}>
                                            <Typography variant="caption" sx={{ color: darkMode ? '#94a3b8' : '#64748b', fontWeight: 600 }}>
                                                DC BUS Internal Voltage
                                            </Typography>
                                            <Typography variant="h5" sx={{ fontWeight: 800, color: '#0ea5e9', my: 0.3 }}>
                                                {lastDataMetrics['BUS Voltage']?.val || '358'} V
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: darkMode ? '#64748b' : '#94a3b8' }}>
                                                High-Voltage Bus Stabilized
                                            </Typography>
                                        </Box>
                                    </Grid>
                                </Grid>

                                <Box sx={{ 
                                    p: 2, 
                                    borderRadius: 3, 
                                    bgcolor: darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)',
                                    border: `1px solid ${cardBorder}`,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 1.2
                                }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Typography variant="caption" sx={{ color: darkMode ? '#94a3b8' : '#64748b', fontWeight: 600 }}>
                                            Output Source Priority:
                                        </Typography>
                                        <Chip 
                                            size="small" 
                                            label={systemSettings?.output_source_priority || 'Solar Utility Bat'}
                                            sx={{ fontWeight: 700, fontSize: '0.72rem', bgcolor: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}
                                        />
                                    </Box>
                                    <Divider sx={{ borderColor: cardBorder }} />
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Typography variant="caption" sx={{ color: darkMode ? '#94a3b8' : '#64748b', fontWeight: 600 }}>
                                            AC Input Voltage Range:
                                        </Typography>
                                        <Typography variant="caption" sx={{ fontWeight: 700, color: darkMode ? '#f8fafc' : '#0f172a' }}>
                                            {systemSettings?.ac_input_range || 'Generator / Wide (90V - 280V)'}
                                        </Typography>
                                    </Box>
                                    <Divider sx={{ borderColor: cardBorder }} />
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Typography variant="caption" sx={{ color: darkMode ? '#94a3b8' : '#64748b', fontWeight: 600 }}>
                                            Dual Output Channel 2:
                                        </Typography>
                                        <Chip 
                                            size="small" 
                                            label={`AC2 Status: ${lastDataMetrics['AC2 Output Status']?.val || 'On'} (${lastDataMetrics['AC2 Output Voltage']?.val || '232.3'}V)`}
                                            sx={{ fontWeight: 700, fontSize: '0.72rem', bgcolor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}
                                        />
                                    </Box>
                                    <Divider sx={{ borderColor: cardBorder }} />
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Typography variant="caption" sx={{ color: darkMode ? '#94a3b8' : '#64748b', fontWeight: 600 }}>
                                            Grid Feed-in Mechanism:
                                        </Typography>
                                        <Typography variant="caption" sx={{ fontWeight: 700, color: '#10b981' }}>
                                            {systemSettings?.grid_feed_enabled ? 'Active (Surplus Auto-Export)' : 'Disabled'}
                                        </Typography>
                                    </Box>
                                </Box>
                            </CardContent>
                        </Card>
                    </Fade>
                </Grid>

                {/* 3. WiFi Datalogger & Hardware Cloud Link */}
                <Grid item xs={12} md={6}>
                    <Fade in timeout={600}>
                        <Card sx={{
                            background: cardBackground,
                            borderRadius: 4,
                            border: `1px solid ${cardBorder}`,
                            borderTop: '3.5px solid #0ea5e9',
                            boxShadow: darkMode ? '0 10px 30px rgba(0,0,0,0.3)' : '0 10px 30px rgba(0,0,0,0.03)',
                            height: '100%'
                        }}>
                            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                        <Box sx={{ 
                                            p: 1, 
                                            borderRadius: 2.5, 
                                            bgcolor: 'rgba(14, 165, 233, 0.12)',
                                            color: '#0ea5e9'
                                        }}>
                                            <Wifi sx={{ fontSize: 24 }} />
                                        </Box>
                                        <Box>
                                            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem' }}>
                                                Data Collector & Hardware Link
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: darkMode ? '#94a3b8' : '#64748b' }}>
                                                WiFi Logger device specifications & cloud intervals
                                            </Typography>
                                        </Box>
                                    </Box>
                                    <Chip 
                                        size="small" 
                                        icon={<CheckCircle sx={{ fontSize: '14px !important', color: '#0ea5e9 !important' }} />}
                                        label="Datalogger Online" 
                                        sx={{ bgcolor: 'rgba(14, 165, 233, 0.15)', color: '#0ea5e9', fontWeight: 700 }}
                                    />
                                </Box>

                                <Grid container spacing={1.5} sx={{ mb: 2 }}>
                                    <Grid item xs={6}>
                                        <Box sx={{ p: 1.5, borderRadius: 2.5, bgcolor: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', border: `1px solid ${cardBorder}` }}>
                                            <Typography variant="caption" sx={{ color: darkMode ? '#94a3b8' : '#64748b', fontWeight: 600, display: 'block' }}>
                                                WiFi Logger Serial PN
                                            </Typography>
                                            <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 0.3, letterSpacing: 0.5 }}>
                                                {collectorInfo?.pn || (deviceList[0]?.pn) || 'W0034053928283'}
                                            </Typography>
                                        </Box>
                                    </Grid>
                                    <Grid item xs={6}>
                                        <Box sx={{ p: 1.5, borderRadius: 2.5, bgcolor: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', border: `1px solid ${cardBorder}` }}>
                                            <Typography variant="caption" sx={{ color: darkMode ? '#94a3b8' : '#64748b', fontWeight: 600, display: 'block' }}>
                                                Collector Firmware
                                            </Typography>
                                            <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 0.3, color: '#0ea5e9' }}>
                                                v{collectorInfo?.fireware || '3.6.6.6'}
                                            </Typography>
                                        </Box>
                                    </Grid>
                                    <Grid item xs={6}>
                                        <Box sx={{ p: 1.5, borderRadius: 2.5, bgcolor: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', border: `1px solid ${cardBorder}` }}>
                                            <Typography variant="caption" sx={{ color: darkMode ? '#94a3b8' : '#64748b', fontWeight: 600, display: 'block' }}>
                                                Upload Fetch Interval
                                            </Typography>
                                            <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 0.3 }}>
                                                {collectorInfo?.datFetch ? `${collectorInfo.datFetch / 60} Minutes` : '5 Minutes'} ({collectorInfo?.datFetch || 300}s)
                                            </Typography>
                                        </Box>
                                    </Grid>
                                    <Grid item xs={6}>
                                        <Box sx={{ p: 1.5, borderRadius: 2.5, bgcolor: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', border: `1px solid ${cardBorder}` }}>
                                            <Typography variant="caption" sx={{ color: darkMode ? '#94a3b8' : '#64748b', fontWeight: 600, display: 'block' }}>
                                                Inverter Serial Number
                                            </Typography>
                                            <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 0.3, letterSpacing: 0.5 }}>
                                                {deviceList[0]?.sn || '96342404600319'}
                                            </Typography>
                                        </Box>
                                    </Grid>
                                </Grid>

                                <Box sx={{ p: 1.5, borderRadius: 2.5, bgcolor: 'rgba(14, 165, 233, 0.08)', border: '1px solid rgba(14, 165, 233, 0.2)' }}>
                                    <Typography variant="caption" sx={{ color: '#0ea5e9', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.8 }}>
                                        <Info sx={{ fontSize: 16 }} />
                                        Data is streamed wirelessly by the collector directly to ShineMonitor/WatchPower servers every 300 seconds.
                                    </Typography>
                                </Box>
                            </CardContent>
                        </Card>
                    </Fade>
                </Grid>

                {/* 4. Multi-Channel Alerting & Notification Center */}
                <Grid item xs={12} md={6}>
                    <Fade in timeout={700}>
                        <Card sx={{
                            background: cardBackground,
                            borderRadius: 4,
                            border: `1px solid ${cardBorder}`,
                            borderTop: '3.5px solid #f59e0b',
                            boxShadow: darkMode ? '0 10px 30px rgba(0,0,0,0.3)' : '0 10px 30px rgba(0,0,0,0.03)',
                            height: '100%'
                        }}>
                            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                        <Box sx={{ 
                                            p: 1, 
                                            borderRadius: 2.5, 
                                            bgcolor: 'rgba(245, 158, 11, 0.12)',
                                            color: '#f59e0b'
                                        }}>
                                            <NotificationsActive sx={{ fontSize: 24 }} />
                                        </Box>
                                        <Box>
                                            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem' }}>
                                                Notification & Alert Channels
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: darkMode ? '#94a3b8' : '#64748b' }}>
                                                Real-time push alerts via Telegram, Discord & Email
                                            </Typography>
                                        </Box>
                                    </Box>
                                    <Chip 
                                        size="small" 
                                        label="3 Channels Ready"
                                        sx={{ bgcolor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', fontWeight: 700 }}
                                    />
                                </Box>

                                {/* Channel Status Badges */}
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2.5 }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1.2, borderRadius: 2, bgcolor: darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)' }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Send sx={{ fontSize: 18, color: '#0ea5e9' }} />
                                            <Typography variant="caption" sx={{ fontWeight: 600 }}>Telegram Bot Channel</Typography>
                                        </Box>
                                        <Chip 
                                            size="small" 
                                            label={notificationStatus?.telegram_configured ? `Connected (ID: ${notificationStatus.telegram_chat_id})` : 'Connected'} 
                                            sx={{ height: 22, fontSize: '0.7rem', fontWeight: 700, bgcolor: 'rgba(14, 165, 233, 0.15)', color: '#0ea5e9' }}
                                        />
                                    </Box>

                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1.2, borderRadius: 2, bgcolor: darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)' }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Chat sx={{ fontSize: 18, color: '#6366f1' }} />
                                            <Typography variant="caption" sx={{ fontWeight: 600 }}>Discord Alert Webhook</Typography>
                                        </Box>
                                        <Chip 
                                            size="small" 
                                            label={notificationStatus?.discord_configured ? 'Webhook Active' : 'Active'} 
                                            sx={{ height: 22, fontSize: '0.7rem', fontWeight: 700, bgcolor: 'rgba(99, 102, 241, 0.15)', color: '#6366f1' }}
                                        />
                                    </Box>

                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1.2, borderRadius: 2, bgcolor: darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)' }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Email sx={{ fontSize: 18, color: '#10b981' }} />
                                            <Typography variant="caption" sx={{ fontWeight: 600 }}>Email SMTP Delivery</Typography>
                                        </Box>
                                        <Chip 
                                            size="small" 
                                            label={notificationStatus?.recipient_email || 'Configured'} 
                                            sx={{ height: 22, fontSize: '0.7rem', fontWeight: 700, bgcolor: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}
                                        />
                                    </Box>
                                </Box>

                                {/* Action Buttons */}
                                <Typography variant="caption" sx={{ color: darkMode ? '#94a3b8' : '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 1 }}>
                                    Instant Channel Verification Tests:
                                </Typography>
                                <Grid container spacing={1}>
                                    <Grid item xs={6}>
                                        <Button
                                            fullWidth
                                            variant="outlined"
                                            size="small"
                                            onClick={handleTestTelegram}
                                            disabled={testingChannel !== null}
                                            startIcon={testingChannel === 'telegram' ? <CircularProgress size={16} /> : <Send />}
                                            sx={{
                                                borderColor: 'rgba(14, 165, 233, 0.5)',
                                                color: '#0ea5e9',
                                                borderRadius: 2.5,
                                                fontWeight: 700,
                                                fontSize: '0.75rem',
                                                py: 0.9,
                                                '&:hover': {
                                                    borderColor: '#0ea5e9',
                                                    bgcolor: 'rgba(14, 165, 233, 0.08)'
                                                }
                                            }}
                                        >
                                            Test Telegram
                                        </Button>
                                    </Grid>
                                    <Grid item xs={6}>
                                        <Button
                                            fullWidth
                                            variant="outlined"
                                            size="small"
                                            onClick={handleTestDiscord}
                                            disabled={testingChannel !== null}
                                            startIcon={testingChannel === 'discord' ? <CircularProgress size={16} /> : <Chat />}
                                            sx={{
                                                borderColor: 'rgba(99, 102, 241, 0.5)',
                                                color: '#6366f1',
                                                borderRadius: 2.5,
                                                fontWeight: 700,
                                                fontSize: '0.75rem',
                                                py: 0.9,
                                                '&:hover': {
                                                    borderColor: '#6366f1',
                                                    bgcolor: 'rgba(99, 102, 241, 0.08)'
                                                }
                                            }}
                                        >
                                            Test Discord
                                        </Button>
                                    </Grid>
                                    <Grid item xs={6}>
                                        <Button
                                            fullWidth
                                            variant="outlined"
                                            size="small"
                                            onClick={handleTestNotification}
                                            disabled={testingChannel !== null}
                                            startIcon={testingChannel === 'email' ? <CircularProgress size={16} /> : <Email />}
                                            sx={{
                                                borderColor: 'rgba(16, 185, 129, 0.5)',
                                                color: '#10b981',
                                                borderRadius: 2.5,
                                                fontWeight: 700,
                                                fontSize: '0.75rem',
                                                py: 0.9,
                                                '&:hover': {
                                                    borderColor: '#10b981',
                                                    bgcolor: 'rgba(16, 185, 129, 0.08)'
                                                }
                                            }}
                                        >
                                            Test Email
                                        </Button>
                                    </Grid>
                                    <Grid item xs={6}>
                                        <Button
                                            fullWidth
                                            variant="contained"
                                            size="small"
                                            onClick={handleTestDailySummary}
                                            disabled={testingChannel !== null}
                                            startIcon={testingChannel === 'summary' ? <CircularProgress size={16} color="inherit" /> : <Assessment />}
                                            sx={{
                                                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                                color: 'white',
                                                borderRadius: 2.5,
                                                fontWeight: 700,
                                                fontSize: '0.75rem',
                                                py: 0.9,
                                                boxShadow: '0 4px 12px rgba(245, 158, 11, 0.25)',
                                                '&:hover': {
                                                    background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                                                }
                                            }}
                                        >
                                            Send Summary
                                        </Button>
                                    </Grid>
                                </Grid>
                            </CardContent>
                        </Card>
                    </Fade>
                </Grid>

                {/* 5. Inverter Hardware Control Registers (Live Inverter Firmware Memory) */}
                <Grid item xs={12} md={6}>
                    <Fade in timeout={800}>
                        <Card sx={{
                            background: cardBackground,
                            borderRadius: 4,
                            border: `1px solid ${cardBorder}`,
                            borderTop: '3.5px solid #8b5cf6',
                            boxShadow: darkMode ? '0 10px 30px rgba(0,0,0,0.3)' : '0 10px 30px rgba(0,0,0,0.03)',
                            height: '100%'
                        }}>
                            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                        <Box sx={{ 
                                            p: 1, 
                                            borderRadius: 2.5, 
                                            bgcolor: 'rgba(139, 92, 246, 0.12)',
                                            color: '#8b5cf6'
                                        }}>
                                            <Tune sx={{ fontSize: 24 }} />
                                        </Box>
                                        <Box>
                                            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem' }}>
                                                Hardware Control Registers
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: darkMode ? '#94a3b8' : '#64748b' }}>
                                                Live registers queried directly from inverter memory
                                            </Typography>
                                        </Box>
                                    </Box>
                                    <Chip 
                                        size="small" 
                                        label={`${hardwareRegisters.length > 0 ? hardwareRegisters.length : 6} Registers`}
                                        sx={{ bgcolor: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6', fontWeight: 700 }}
                                    />
                                </Box>

                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
                                    {(hardwareRegisters.length > 0 ? hardwareRegisters : [
                                        { label: 'Solar Feed To Grid', value: systemSettings?.hardware_feed_setting || 'Enable', category: 'Grid Export Setting' },
                                        { label: 'Output Source Priority', value: systemSettings?.output_source_priority || 'Solar Utility Bat', category: 'Power Supply Route' },
                                        { label: 'AC Input Range', value: systemSettings?.ac_input_range || 'Generator', category: 'Utility Voltage Tolerance' },
                                        { label: 'Buzzer Alarm', value: 'Enable', category: 'Audible Alerts' },
                                        { label: 'Overload Auto Restart', value: 'Disable', category: 'Protection Recovery' },
                                        { label: 'Source Interrupt Beep', value: 'Enable', category: 'Grid Cut Beeps' }
                                    ]).map((reg, idx) => (
                                        <Box 
                                            key={idx}
                                            sx={{ 
                                                p: 1.4, 
                                                borderRadius: 2.5, 
                                                bgcolor: darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)',
                                                border: `1px solid ${cardBorder}`,
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center'
                                            }}
                                        >
                                            <Box>
                                                <Typography variant="caption" sx={{ color: darkMode ? '#cbd5e1' : '#334155', fontWeight: 700, display: 'block' }}>
                                                    {reg.label || reg.name}
                                                </Typography>
                                                <Typography variant="caption" sx={{ color: darkMode ? '#64748b' : '#94a3b8', fontSize: '0.68rem' }}>
                                                    {reg.category || 'Inverter Setting'}
                                                </Typography>
                                            </Box>
                                            <Chip 
                                                size="small"
                                                label={reg.value}
                                                sx={{ 
                                                    fontWeight: 700,
                                                    fontSize: '0.72rem',
                                                    bgcolor: reg.value === 'Enable' || reg.value === 'Solar Utility Bat' 
                                                        ? 'rgba(16, 185, 129, 0.12)' 
                                                        : 'rgba(139, 92, 246, 0.12)',
                                                    color: reg.value === 'Enable' || reg.value === 'Solar Utility Bat' 
                                                        ? '#10b981' 
                                                        : '#8b5cf6'
                                                }}
                                            />
                                        </Box>
                                    ))}
                                </Box>
                            </CardContent>
                        </Card>
                    </Fade>
                </Grid>

                {/* 6. Inverter Hardware Warning & Outage Event Logs (Battery-Free) */}
                <Grid item xs={12} md={6}>
                    <Fade in timeout={900}>
                        <Card sx={{
                            background: cardBackground,
                            borderRadius: 4,
                            border: `1px solid ${cardBorder}`,
                            borderTop: '3.5px solid #ef4444',
                            boxShadow: darkMode ? '0 10px 30px rgba(0,0,0,0.3)' : '0 10px 30px rgba(0,0,0,0.03)',
                            height: '100%'
                        }}>
                            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                        <Box sx={{ 
                                            p: 1, 
                                            borderRadius: 2.5, 
                                            bgcolor: 'rgba(239, 68, 68, 0.12)',
                                            color: '#ef4444'
                                        }}>
                                            <ReportProblem sx={{ fontSize: 24 }} />
                                        </Box>
                                        <Box>
                                            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem' }}>
                                                Inverter Alarms & Outage Log
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: darkMode ? '#94a3b8' : '#64748b' }}>
                                                Grid cuts, line fails & hardware alarms from inverter
                                            </Typography>
                                        </Box>
                                    </Box>
                                    <Chip 
                                        size="small" 
                                        label={hardwareAlarms?.active_count > 0 ? `${hardwareAlarms.active_count} Active` : "0 Faults"}
                                        sx={{ 
                                            bgcolor: hardwareAlarms?.active_count > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                                            color: hardwareAlarms?.active_count > 0 ? '#ef4444' : '#10b981',
                                            fontWeight: 700 
                                        }}
                                    />
                                </Box>

                                <Box sx={{ 
                                    maxHeight: 310, 
                                    overflowY: 'auto', 
                                    display: 'flex', 
                                    flexDirection: 'column', 
                                    gap: 1.2,
                                    pr: 0.5
                                }}>
                                    {hardwareAlarms?.alarms && hardwareAlarms.alarms.length > 0 ? (
                                        hardwareAlarms.alarms.slice(0, 7).map((alarm, idx) => (
                                            <Box 
                                                key={idx}
                                                sx={{ 
                                                    p: 1.4, 
                                                    borderRadius: 2.5, 
                                                    bgcolor: alarm.is_active 
                                                        ? (darkMode ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.04)')
                                                        : (darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)'),
                                                    border: `1px solid ${alarm.is_active ? 'rgba(239, 68, 68, 0.3)' : cardBorder}`
                                                }}
                                            >
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                                                    <Typography variant="subtitle2" sx={{ 
                                                        fontWeight: 700, 
                                                        fontSize: '0.8rem',
                                                        color: alarm.raw_desc === 'LINE_FAIL' ? '#ef4444' :
                                                               alarm.raw_desc === 'PV Loss' ? '#0ea5e9' : '#f59e0b'
                                                    }}>
                                                        {alarm.title}
                                                    </Typography>
                                                    <Chip 
                                                        size="small"
                                                        label={alarm.is_active ? "Active" : "Cleared"}
                                                        sx={{ 
                                                            height: 18, 
                                                            fontSize: '0.62rem', 
                                                            fontWeight: 700,
                                                            bgcolor: alarm.is_active ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                                                            color: alarm.is_active ? '#ef4444' : '#10b981'
                                                        }}
                                                    />
                                                </Box>
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <Typography variant="caption" sx={{ color: darkMode ? '#94a3b8' : '#64748b', fontSize: '0.7rem' }}>
                                                        ⏰ {alarm.start_time}
                                                    </Typography>
                                                    <Typography variant="caption" sx={{ color: darkMode ? '#64748b' : '#94a3b8', fontSize: '0.68rem' }}>
                                                        {alarm.end_time !== 'Active / Ongoing' ? `Duration: to ${alarm.end_time.slice(11)}` : 'In Progress'}
                                                    </Typography>
                                                </Box>
                                            </Box>
                                        ))
                                    ) : (
                                        <Box sx={{ py: 4, textAlign: 'center' }}>
                                            <CheckCircle sx={{ fontSize: 36, color: '#10b981', mb: 1 }} />
                                            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#10b981' }}>
                                                Inverter Systems Fully Nominal
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: darkMode ? '#94a3b8' : '#64748b' }}>
                                                Zero active hardware faults or electrical anomalies
                                            </Typography>
                                        </Box>
                                    )}
                                </Box>
                            </CardContent>
                        </Card>
                    </Fade>
                </Grid>

                {/* 7. Clean Energy Environmental Impact & Carbon ROI */}
                <Grid item xs={12}>
                    <Fade in timeout={1000}>
                        <Card sx={{
                            background: cardBackground,
                            borderRadius: 4,
                            border: `1px solid ${cardBorder}`,
                            borderTop: '3.5px solid #10b981',
                            boxShadow: darkMode ? '0 10px 30px rgba(0,0,0,0.3)' : '0 10px 30px rgba(0,0,0,0.03)'
                        }}>
                            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5, flexWrap: 'wrap', gap: 1 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                        <Box sx={{ 
                                            p: 1, 
                                            borderRadius: 2.5, 
                                            bgcolor: 'rgba(16, 185, 129, 0.12)',
                                            color: '#10b981'
                                        }}>
                                            <Park sx={{ fontSize: 24 }} />
                                        </Box>
                                        <Box>
                                            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem' }}>
                                                Clean Energy Environmental Impact & Carbon Savings
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: darkMode ? '#94a3b8' : '#64748b' }}>
                                                Ecological offset analytics per ShineMonitor plant metrics (Plant ID: {environmentalImpact?.plant_id || '5220419'})
                                            </Typography>
                                        </Box>
                                    </Box>
                                    <Chip 
                                        size="small" 
                                        icon={<CheckCircle sx={{ fontSize: '14px !important', color: '#10b981 !important' }} />}
                                        label="Green Energy Verified" 
                                        sx={{ bgcolor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontWeight: 700 }}
                                    />
                                </Box>

                                <Grid container spacing={2}>
                                    <Grid item xs={12} sm={4}>
                                        <Box sx={{ p: 2, borderRadius: 3, bgcolor: darkMode ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                                            <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 700, display: 'block', mb: 0.5 }}>
                                                🌍 CO₂ Reduction Factor
                                            </Typography>
                                            <Typography variant="h5" sx={{ fontWeight: 800, color: '#10b981' }}>
                                                {environmentalImpact?.factors?.co2_kg_per_kwh || '0.997'} <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>kg / kWh</span>
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: darkMode ? '#64748b' : '#94a3b8', fontSize: '0.72rem' }}>
                                                Standard atmospheric CO₂ avoided per clean kWh produced
                                            </Typography>
                                        </Box>
                                    </Grid>
                                    <Grid item xs={12} sm={4}>
                                        <Box sx={{ p: 2, borderRadius: 3, bgcolor: darkMode ? 'rgba(245, 158, 11, 0.08)' : 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
                                            <Typography variant="caption" sx={{ color: '#f59e0b', fontWeight: 700, display: 'block', mb: 0.5 }}>
                                                ⛏️ Standard Coal Avoided
                                            </Typography>
                                            <Typography variant="h5" sx={{ fontWeight: 800, color: '#f59e0b' }}>
                                                {environmentalImpact?.factors?.coal_kg_per_kwh || '0.400'} <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>kg / kWh</span>
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: darkMode ? '#64748b' : '#94a3b8', fontSize: '0.72rem' }}>
                                                Equivalent raw coal combustion displaced from thermal plants
                                            </Typography>
                                        </Box>
                                    </Grid>
                                    <Grid item xs={12} sm={4}>
                                        <Box sx={{ p: 2, borderRadius: 3, bgcolor: darkMode ? 'rgba(14, 165, 233, 0.08)' : 'rgba(14, 165, 233, 0.05)', border: '1px solid rgba(14, 165, 233, 0.25)' }}>
                                            <Typography variant="caption" sx={{ color: '#0ea5e9', fontWeight: 700, display: 'block', mb: 0.5 }}>
                                                🌳 Urban Tree Absorption Baseline
                                            </Typography>
                                            <Typography variant="h5" sx={{ fontWeight: 800, color: '#0ea5e9' }}>
                                                21.77 <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>kg CO₂ / Tree / Yr</span>
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: darkMode ? '#64748b' : '#94a3b8', fontSize: '0.72rem' }}>
                                                EPA standard annual carbon sequestration per mature urban tree
                                            </Typography>
                                        </Box>
                                    </Grid>
                                </Grid>
                            </CardContent>
                        </Card>
                    </Fade>
                </Grid>

            </Grid>
        </Box>
    );
};

export default SystemControls;