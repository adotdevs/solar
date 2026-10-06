import React, { useState } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import {
    Drawer,
    AppBar,
    Toolbar,
    Typography,
    Box,
    CssBaseline,
    useTheme,
    useMediaQuery,
    IconButton,
    styled,
    Popover,
    Tooltip,
    createTheme,
    ThemeProvider,
    Button
} from "@mui/material";
import {
    Menu as MenuIcon,
    Dashboard as DashboardIcon,
    BarChart as BarChartIcon,
    SolarPower as SolarIcon,
    Brightness4,
    Brightness7,
    Palette,
    Settings
} from "@mui/icons-material";
import './Table.css';
import DailyStats from './pages/DailyStats';
import MonthlyStats from './pages/MonthlyStats';
import SystemControls from './pages/SystemControls';

const drawerWidth = 280;

const Main = styled("main", { shouldForwardProp: (prop) => prop !== "open" })(
    ({ theme, open }) => ({
        flexGrow: 1,
        padding: theme.spacing(2),
        [theme.breakpoints.up('sm')]: {
            padding: theme.spacing(3),
        },
        transition: theme.transitions.create("margin", {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
        }),
        marginLeft: 0,
        [theme.breakpoints.up('md')]: {
            marginLeft: open ? 0 : `-${drawerWidth}px`,
        },
        ...(open && {
            transition: theme.transitions.create("margin", {
                easing: theme.transitions.easing.easeOut,
                duration: theme.transitions.duration.enteringScreen,
            }),
            [theme.breakpoints.up('md')]: {
                marginLeft: 0,
            },
        }),
    })
);

const AppBarStyled = styled(AppBar, {
    shouldForwardProp: (prop) => prop !== "open",
})(({ theme, open }) => ({
    background: theme.palette.mode === 'dark' 
        ? "rgba(11, 15, 25, 0.82)" 
        : "rgba(255, 255, 255, 0.85)",
    color: theme.palette.mode === 'dark' ? "#f8fafc" : "#0f172a",
    backdropFilter: "blur(20px)",
    borderBottom: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}`,
    boxShadow: theme.palette.mode === 'dark' 
        ? "0 4px 20px rgba(0, 0, 0, 0.4)" 
        : "0 4px 20px rgba(0, 0, 0, 0.04)",
    transition: theme.transitions.create(["margin", "width"], {
        easing: theme.transitions.easing.sharp,
        duration: theme.transitions.duration.leavingScreen,
    }),
    ...(open && {
        width: `calc(100% - ${drawerWidth}px)`,
        marginLeft: `${drawerWidth}px`,
        transition: theme.transitions.create(["margin", "width"], {
            easing: theme.transitions.easing.easeOut,
            duration: theme.transitions.duration.enteringScreen,
        }),
    }),
}));

const DrawerHeader = styled("div")(({ theme }) => ({
    display: "flex",
    alignItems: "center",
    padding: theme.spacing(0, 1),
    ...theme.mixins.toolbar,
    justifyContent: "flex-end",
}));

const Dashboard = () => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("md"));
    const [mobileOpen, setMobileOpen] = useState(false);
    const [darkMode, setDarkMode] = useState(false);
    const [themeColor, setThemeColor] = useState('emerald');
    const [themeAnchorEl, setThemeAnchorEl] = useState(null);
    
    const navigate = useNavigate();
    const location = useLocation();

    const handleDrawerToggle = () => {
        setMobileOpen(!mobileOpen);
    };

    const menuItems = [
        { text: "Daily Stats", icon: <DashboardIcon />, path: "/" },
        { text: "Monthly Stats", icon: <BarChartIcon />, path: "/monthly" },
        { text: "System Controls", icon: <Settings />, path: "/controls" },
    ];
    
    // Modern harmonious Cleantech color themes
    const themeColors = {
        emerald: { primary: '#10b981', secondary: '#059669', gradient: 'linear-gradient(135deg, #10b981 0%, #047857 100%)' },
        purple: { primary: '#6366f1', secondary: '#4f46e5', gradient: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)' },
        blue: { primary: '#0ea5e9', secondary: '#0284c7', gradient: 'linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)' },
        amber: { primary: '#f59e0b', secondary: '#d97706', gradient: 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)' }
    };

    const customTheme = createTheme({
        typography: {
            fontFamily: "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            h3: { fontWeight: 800, letterSpacing: '-0.02em' },
            h4: { fontWeight: 700, letterSpacing: '-0.01em' },
            h5: { fontWeight: 600 },
            h6: { fontWeight: 600 },
            button: { textTransform: 'none', fontWeight: 600 },
        },
        shape: {
            borderRadius: 16,
        },
        palette: {
            mode: darkMode ? 'dark' : 'light',
            primary: {
                main: themeColors[themeColor].primary,
            },
            secondary: {
                main: themeColors[themeColor].secondary,
            },
            background: {
                default: darkMode ? '#0a0e17' : '#f8fafc',
                paper: darkMode ? '#111827' : '#ffffff',
            },
        },
    });

    return (
        <ThemeProvider theme={customTheme}>
            <Box sx={{ display: "flex", bgcolor: 'background.default', minHeight: '100vh' }}>
            <CssBaseline />
            <AppBarStyled position="fixed" open={mobileOpen}>
                <Toolbar>
                    <IconButton
                        color="inherit"
                        aria-label="open drawer"
                        onClick={handleDrawerToggle}
                        edge="start"
                        sx={{ mr: 2, ...(mobileOpen && { display: "none" }) }}
                    >
                        <MenuIcon />
                    </IconButton>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexGrow: 1 }}>
                        <Box sx={{
                            width: 36,
                            height: 36,
                            borderRadius: '10px',
                            background: `linear-gradient(135deg, ${themeColors[themeColor].primary} 0%, ${themeColors[themeColor].secondary} 100%)`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: `0 4px 14px ${themeColors[themeColor].primary}40`,
                        }}>
                            <SolarIcon sx={{ color: 'white', fontSize: 22 }} />
                        </Box>
                        <Typography 
                            variant="h6" 
                            noWrap 
                            component="div" 
                            sx={{ 
                                fontSize: { xs: '0.95rem', sm: '1.2rem' },
                                fontWeight: 700,
                                letterSpacing: '-0.02em',
                                color: darkMode ? '#f8fafc' : '#0f172a'
                            }}
                        >
                            Solar Power Dashboard
                        </Typography>
                    </Box>
                    
                    {/* Dark Mode Toggle */}
                    <Tooltip title={darkMode ? "Light Mode" : "Dark Mode"}>
                        <IconButton onClick={() => setDarkMode(!darkMode)} color="inherit">
                            {darkMode ? <Brightness7 /> : <Brightness4 />}
                        </IconButton>
                    </Tooltip>
                    
                    {/* Theme Color Selector */}
                    <Tooltip title="Change Theme">
                        <IconButton 
                            onClick={(e) => setThemeAnchorEl(e.currentTarget)} 
                            color="inherit"
                        >
                            <Palette />
                        </IconButton>
                    </Tooltip>
                    
                    <Popover
                        open={Boolean(themeAnchorEl)}
                        anchorEl={themeAnchorEl}
                        onClose={() => setThemeAnchorEl(null)}
                        anchorOrigin={{
                            vertical: 'bottom',
                            horizontal: 'right',
                        }}
                        transformOrigin={{
                            vertical: 'top',
                            horizontal: 'right',
                        }}
                    >
                        <Box sx={{ p: 2 }}>
                            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                                Select Theme Color
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1, flexDirection: 'column' }}>
                                {Object.keys(themeColors).map((color) => (
                                    <Button
                                        key={color}
                                        onClick={() => {
                                            setThemeColor(color);
                                            setThemeAnchorEl(null);
                                        }}
                                        variant={themeColor === color ? 'contained' : 'outlined'}
                                        sx={{
                                            background: themeColor === color 
                                                ? `linear-gradient(135deg, ${themeColors[color].primary} 0%, ${themeColors[color].secondary} 100%)`
                                                : 'transparent',
                                            borderColor: themeColors[color].primary,
                                            color: themeColor === color ? 'white' : themeColors[color].primary,
                                            '&:hover': {
                                                background: `linear-gradient(135deg, ${themeColors[color].primary} 0%, ${themeColors[color].secondary} 100%)`,
                                                color: 'white'
                                            }
                                        }}
                                    >
                                        {color.charAt(0).toUpperCase() + color.slice(1)}
                                    </Button>
                                ))}
                            </Box>
                        </Box>
                    </Popover>
                </Toolbar>
            </AppBarStyled>

            <Drawer
                sx={{
                    width: drawerWidth,
                    flexShrink: 0,
                    "& .MuiDrawer-paper": {
                        width: drawerWidth,
                        boxSizing: "border-box",
                        background: "linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
                        color: "white",
                        borderRight: "1px solid rgba(255, 255, 255, 0.1)",
                    },
                }}
                variant={isMobile ? "temporary" : "persistent"}
                anchor="left"
                open={mobileOpen}
                onClose={handleDrawerToggle}
            >
                <IconButton
                    color="inherit"
                    aria-label="close drawer"
                    onClick={handleDrawerToggle}
                    edge="start"
                    sx={{ ml: "auto", mr: 2, mt: 1 }}
                >
                    <MenuIcon />
                </IconButton>
                <Box sx={{ p: 3, textAlign: "center", mb: 2 }}>
                    <Box sx={{ 
                        display: 'inline-flex',
                        p: 2,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                        mb: 2,
                        boxShadow: '0 8px 32px rgba(240, 147, 251, 0.3)'
                    }}>
                        <SolarIcon sx={{ fontSize: 48, color: 'white' }} />
                    </Box>
                    <Typography variant="h5" gutterBottom sx={{ 
                        fontWeight: 700,
                        fontSize: { xs: '1.25rem', sm: '1.5rem' }
                    }}>
                        Solar Analytics
                    </Typography>
                    <Typography variant="body2" sx={{ 
                        opacity: 0.7, 
                        fontSize: { xs: '0.75rem', sm: '0.875rem' }
                    }}>
                        Monitor your solar power system
                    </Typography>
                </Box>

                <Box sx={{ px: 2, pb: 2 }}>
                    {menuItems.map((item) => (
                        <Box
                            key={item.text}
                            onClick={() => {
                                navigate(item.path);
                                if (isMobile) setMobileOpen(false);
                            }}
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                p: 2,
                                mb: 1,
                                borderRadius: 3,
                                cursor: "pointer",
                                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                                background: location.pathname === item.path 
                                    ? "linear-gradient(135deg, rgba(102, 126, 234, 0.4) 0%, rgba(118, 75, 162, 0.4) 100%)"
                                    : "transparent",
                                border: location.pathname === item.path 
                                    ? "1px solid rgba(255, 255, 255, 0.2)"
                                    : "1px solid transparent",
                                "&:hover": {
                                    background: "linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%)",
                                    transform: "translateX(5px)",
                                    border: "1px solid rgba(255, 255, 255, 0.1)",
                                },
                            }}
                        >
                            <Box sx={{ mr: 2, opacity: 0.9, display: 'flex', alignItems: 'center' }}>{item.icon}</Box>
                            <Typography variant="body1" sx={{ 
                                fontWeight: location.pathname === item.path ? 600 : 400,
                                fontSize: { xs: '0.875rem', sm: '1rem' }
                            }}>
                                {item.text}
                            </Typography>
                        </Box>
                    ))}
                </Box>
            </Drawer>

            <Main open={mobileOpen}>
                <DrawerHeader />
                <Box sx={{ p: { xs: 1, md: 3 } }}>
                    <Routes>
                        <Route path="/" element={<DailyStats darkMode={darkMode} themeColor={themeColor} themeColors={themeColors} />} />
                        <Route path="/monthly" element={<MonthlyStats darkMode={darkMode} themeColor={themeColor} themeColors={themeColors} />} />
                        <Route path="/controls" element={<SystemControls darkMode={darkMode} themeColor={themeColor} themeColors={themeColors} />} />
                    </Routes>
                </Box>
            </Main>
        </Box>
        </ThemeProvider>
    );
};

export default Dashboard;
