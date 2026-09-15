import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pencil, X, Save, Layers, Globe, Loader2 } from 'lucide-react';
import { getCountryList } from '../utils/iso-utils.js';

export default function EditNameModal({ isOpen, onClose, onSave, item }) {
    const [name, setName] = useState('');
    const [country, setCountry] = useState('GENERAL');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (item) {
            setName(item.name || item.displayName || item.title || '');
            setCountry((item.group || item.category || 'GENERAL').toUpperCase());
            setError('');
        }
    }, [item, isOpen]);

    if (!isOpen || !item) return null;

    const countries = getCountryList();
    const isFacebase = item.type === 'facebase' || item.type === 'facebases';
    const hasVariants = item.groupVariants && item.groupVariants.length > 1;

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) {
            setError('Name cannot be empty.');
            return;
        }

        setIsSaving(true);
        setError('');
        try {
            await onSave({
                id: item.id,
                type: item.type,
                newName: trimmed,
                groupVariants: item.groupVariants,
                extra: isFacebase ? { country } : {}
            });
            onClose();
        } catch (err) {
            console.error('Error saving item name:', err);
            setError(err.message || 'Failed to save changes.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 15 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 15 }}
                    transition={{ duration: 0.15 }}
                    className="relative w-full max-w-md bg-[#16171d] border border-[var(--gold2)]/30 rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.8)] overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Gold header accent */}
                    <div className="h-1 w-full bg-gradient-to-r from-[var(--gold2)] via-amber-400 to-yellow-600" />

                    <form onSubmit={handleSubmit} className="p-6">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-[var(--gold2)]/10 border border-[var(--gold2)]/30 flex items-center justify-center text-[var(--gold2)] flex-shrink-0">
                                    <Pencil className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-zinc-100">
                                        Edit Item Name
                                    </h3>
                                    <p className="text-xs text-zinc-400 capitalize">
                                        {item.type || 'Catalog Item'}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isSaving}
                                className="text-zinc-500 hover:text-zinc-300 p-1 rounded-lg transition disabled:opacity-50"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="mt-5 space-y-4">
                            {/* Name Input */}
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                                    Name / Title
                                </label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Enter item name..."
                                    className="w-full h-11 px-3.5 text-sm dark-input rounded-xl border border-zinc-700 focus:border-[var(--gold2)] focus:ring-1 focus:ring-[var(--gold2)] transition"
                                    autoFocus
                                    disabled={isSaving}
                                />
                            </div>

                            {/* Country Select (Facebases only) */}
                            {isFacebase && (
                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5 flex items-center gap-1.5">
                                        <Globe className="w-3.5 h-3.5 text-[var(--gold2)]" />
                                        <span>Country</span>
                                    </label>
                                    <select
                                        value={country}
                                        onChange={(e) => setCountry(e.target.value)}
                                        className="w-full h-11 px-3.5 text-sm dark-input rounded-xl border border-zinc-700 appearance-none cursor-pointer focus:border-[var(--gold2)] transition"
                                        disabled={isSaving}
                                    >
                                        <option value="GENERAL">GENERAL</option>
                                        {countries.map(c => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Multi-variants notice */}
                            {hasVariants && (
                                <div className="p-3 bg-zinc-900/80 border border-zinc-800 rounded-xl flex items-start gap-2.5 text-xs text-zinc-300">
                                    <Layers className="w-4 h-4 text-[var(--gold2)] flex-shrink-0 mt-0.5" />
                                    <span>
                                        This group contains <strong className="text-[var(--gold2)]">{item.groupVariants.length} variants</strong>. Updating the name will update all variants in this group.
                                    </span>
                                </div>
                            )}

                            {error && (
                                <div className="p-3 rounded-xl bg-red-950/80 border border-red-700 text-red-300 text-xs">
                                    {error}
                                </div>
                            )}
                        </div>

                        {/* Action buttons */}
                        <div className="mt-6 flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isSaving}
                                className="px-4 py-2 text-xs font-semibold rounded-xl border border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:bg-zinc-800 hover:text-white transition disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isSaving || !name.trim()}
                                className="px-5 py-2 text-xs font-semibold rounded-xl bg-[var(--gold2)] hover:brightness-110 text-black shadow-lg shadow-[var(--gold2)]/20 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSaving ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin text-black" />
                                        <span>Saving...</span>
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-4 h-4" />
                                        <span>Save Changes</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
