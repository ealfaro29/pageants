import React, { useState, useEffect } from 'react';
import { Camera, Clock, UploadCloud, Ticket, Sun, Moon, Crown, Heart, Zap, Diamond, Trophy, MoreHorizontal, Settings, X, Search, Filter } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import AdminModal from './AdminModal';
import TimeConverterModal from './TimeConverterModal';
import DriveModal from './DriveModal';
import TicketModal from './TicketModal';

export default function Header({ activeTab, setActiveTab }) {
    const [isAdminOpen, setIsAdminOpen] = useState(false);
    const [isTimeConverterOpen, setIsTimeConverterOpen] = useState(false);
    const [isDriveOpen, setIsDriveOpen] = useState(false);
    const [isTicketOpen, setIsTicketOpen] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const THEMES = ['pink', 'apple', 'gold', 'cyberpunk', 'dark'];

    const [theme, setTheme] = useState(() => {
        return localStorage.getItem('app-theme') || 'pink';
    });

    useEffect(() => {
        if (theme && theme !== 'pink') {
            document.documentElement.setAttribute('data-theme', theme);
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        localStorage.setItem('app-theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => {
            const nextIndex = (THEMES.indexOf(prev) + 1) % THEMES.length;
            return THEMES[nextIndex];
        });
    };

    const renderThemeIcon = () => {
        switch (theme) {
            case 'apple': return <Sun className="w-5 h-5" />;
            case 'gold': return <Crown className="w-5 h-5" />;
            case 'cyberpunk': return <Zap className="w-5 h-5" />;
            case 'dark': return <Moon className="w-5 h-5" />;
            case 'pink':
            default: return <Heart className="w-5 h-5" />;
        }
    };

    const tabs = [
        { id: 'favorites', label: '❤️' },
        { id: 'facebases', label: 'Facebases' },
        { id: 'avatar', label: 'Avatar' },
        { id: 'textures', label: 'Textures' },
        { id: 'music', label: 'Music' }
    ];

    const MenuButton = ({ onClick, icon: Icon, label, color = 'var(--gold2)' }) => (
        <button 
            onClick={() => { onClick(); setIsMenuOpen(false); }} 
            className="flex items-center gap-3 w-full px-4 py-3 text-sm text-zinc-300 hover:bg-white/5 hover:text-white rounded-xl transition-all"
        >
            <div className="w-8 h-8 flex items-center justify-center bg-zinc-800/50 rounded-lg" style={{ color }}>
                <Icon className="w-4 h-4" />
            </div>
          <span>{label}</span>
        </button>
    );

    return (
        <>
            <header className="panel flex flex-col md:flex-row items-center justify-between p-3 md:p-4 gap-3 md:gap-4 flex-shrink-0" role="banner">
            <div className="flex items-center justify-between w-full md:w-auto gap-4">
                <a href="https://pageants.app" target="_blank" rel="noreferrer" className="text-2xl md:text-3xl lg:text-4xl title-fancy gold-title no-underline hover:brightness-110" aria-label="Pageants App home">
                    <h1 className="whitespace-nowrap">Pageants App</h1>
                </a>

                {/* Mobile Menu Trigger */}
                <button 
                    onClick={() => setIsMenuOpen(true)}
                    className="md:hidden w-10 h-10 flex items-center justify-center bg-zinc-800/50 text-[var(--gold2)] rounded-full border border-zinc-700/50"
                >
                    <MoreHorizontal className="w-5 h-5" />
                </button>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center justify-center flex-wrap gap-2" role="navigation" aria-label="Main navigation">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        className={`tab-nav-button ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                        aria-label={`${tab.label} tab`}
                        aria-pressed={activeTab === tab.id}
                    >
                        {tab.label}
                    </button>
                ))}
                <button
                    id="nav-admin-btn"
                    className="tab-nav-button"
                    aria-label="Admin Panel"
                    style={{ borderColor: '#333', color: '#666' }}
                    onClick={() => setIsAdminOpen(true)}
                >
                    + Admin
                </button>
            </nav>

            {/* Desktop Utility Toolbar */}
            <div className="hidden md:flex items-center gap-2" role="toolbar" aria-label="Utility actions">
                <button onClick={() => setIsTimeConverterOpen(true)} className="w-10 h-10 flex items-center justify-center bg-[var(--card-lighter)] text-[var(--gold2)] rounded-full border border-transparent hover:border-[var(--border)] hover:scale-110 transition-all" aria-label="Open time converter" title="Time Converter">
                    <Clock className="w-5 h-5" />
                </button>
                <button onClick={() => setIsDriveOpen(true)} className="w-10 h-10 flex items-center justify-center bg-[var(--card-lighter)] text-[var(--gold2)] rounded-full border border-transparent hover:border-[var(--border)] hover:scale-110 transition-all" aria-label="Upload to Google Drive" title="Subir a Drive">
                    <UploadCloud className="w-5 h-5" />
                </button>
                <button onClick={() => setIsTicketOpen(true)} className="w-10 h-10 flex items-center justify-center bg-[var(--card-lighter)] text-[var(--gold2)] rounded-full border border-transparent hover:border-[var(--border)] hover:scale-110 transition-all text-xl" aria-label="Copy ticket names" title="Ticket Names">
                    <Ticket className="w-5 h-5" />
                </button>
                <Link to="/" className="w-10 h-10 flex items-center justify-center bg-[var(--card-lighter)] text-[var(--gold2)] rounded-full border border-transparent hover:border-[var(--border)] hover:scale-110 transition-all text-xl" aria-label="Open Scoring Sessions" title="Scoring Sessions">
                    <Trophy className="w-5 h-5" />
                </Link>
                <a href="https://gemini.google.com/gem/45de6cb382e1" target="_blank" rel="noreferrer" className="w-10 h-10 flex items-center justify-center bg-[var(--card-lighter)] text-[var(--gold2)] rounded-full border border-transparent hover:border-[var(--border)] hover:scale-110 transition-all" aria-label="Open Gemini Gem" title="AI Assistant">
                    <Diamond className="w-5 h-5" />
                </a>
                <button onClick={toggleTheme} className="w-10 h-10 flex items-center justify-center bg-[var(--card-lighter)] text-[var(--gold2)] rounded-full border border-transparent hover:border-[var(--border)] hover:scale-110 transition-all" aria-label="Toggle Theme" title={`Change Theme (Current: ${theme})`}>
                    {renderThemeIcon()}
                </button>
            </div>
        </header>

        {/* Mobile Utility Menu */}
        <AnimatePresence>
            {isMenuOpen && (
                <>
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsMenuOpen(false)}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998]"
                    />
                    <motion.div 
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed right-0 top-0 bottom-0 w-[280px] bg-[#0c0c0e] border-l border-zinc-800 z-[9999] shadow-2xl p-6 flex flex-col gap-6"
                    >
                        <div className="flex items-center justify-between">
                            <h3 className="text-zinc-400 uppercase tracking-widest text-xs font-bold">Tools & Settings</h3>
                            <button onClick={() => setIsMenuOpen(false)} className="text-zinc-500 hover:text-white">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="grid gap-1">
                            <MenuButton icon={Trophy} label="Scoring System" onClick={() => window.location.href = '/'} />
                            <MenuButton icon={Settings} label="Admin Dashboard" onClick={() => setIsAdminOpen(true)} color="#666" />
                            <div className="h-[1px] bg-zinc-800 my-2 mx-2" />
                            <MenuButton icon={Clock} label="Time Converter" onClick={() => setIsTimeConverterOpen(true)} />
                            <MenuButton icon={UploadCloud} label="Subir a Drive" onClick={() => setIsDriveOpen(true)} />
                            <MenuButton icon={Ticket} label="Ticket Names" onClick={() => setIsTicketOpen(true)} />
                            <MenuButton icon={Diamond} label="AI Assistant" onClick={() => window.open('https://gemini.google.com/gem/45de6cb382e1', '_blank')} />
                            <div className="h-[1px] bg-zinc-800 my-2 mx-2" />
                            <MenuButton icon={renderThemeIcon().type} label={`Theme: ${theme}`} onClick={toggleTheme} />
                        </div>

                        <div className="mt-auto pt-6 border-t border-zinc-900 text-center">
                            <p className="text-[10px] text-zinc-600 uppercase tracking-tighter">&copy; 2026 Pageants App v2.0</p>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>

        <AdminModal isOpen={isAdminOpen} onClose={() => setIsAdminOpen(false)} />
        <TimeConverterModal isOpen={isTimeConverterOpen} onClose={() => setIsTimeConverterOpen(false)} />
        <DriveModal isOpen={isDriveOpen} onClose={() => setIsDriveOpen(false)} />
        <TicketModal isOpen={isTicketOpen} onClose={() => setIsTicketOpen(false)} />
    </>
    );
}
