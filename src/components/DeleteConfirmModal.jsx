import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, AlertTriangle, X, Loader2, Layers } from 'lucide-react';

export default function DeleteConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    item,
    isBatch = false,
    batchItems = []
}) {
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteScope, setDeleteScope] = useState('single'); // 'single' or 'all_variants'
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const hasVariants = Boolean(
        !isBatch &&
        item?.groupVariants &&
        item.groupVariants.length > 1
    );

    const handleConfirm = async () => {
        setIsDeleting(true);
        setError('');
        try {
            if (isBatch) {
                await onConfirm({ mode: 'batch', items: batchItems });
            } else if (hasVariants && deleteScope === 'all_variants') {
                const variantsToDelete = item.groupVariants.map(v => ({
                    id: v.id,
                    type: v.type || item.type
                }));
                await onConfirm({ mode: 'variants', items: variantsToDelete });
            } else {
                await onConfirm({
                    mode: 'single',
                    items: [{ id: item.id, type: item.type }]
                });
            }
            onClose();
        } catch (err) {
            console.error('Delete error:', err);
            setError(err.message || 'Failed to delete item(s). Please check permissions.');
        } finally {
            setIsDeleting(false);
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
                    className="relative w-full max-w-md bg-[#16171d] border border-red-500/30 rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.8)] overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Top warning line */}
                    <div className="h-1 w-full bg-gradient-to-r from-red-500 via-rose-500 to-amber-500" />

                    <div className="p-6">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 flex-shrink-0">
                                    <Trash2 className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-zinc-100">
                                        {isBatch ? 'Delete Selected Items' : 'Delete Item'}
                                    </h3>
                                    <p className="text-xs text-zinc-400">
                                        Permanent Firestore removal
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                disabled={isDeleting}
                                className="text-zinc-500 hover:text-zinc-300 p-1 rounded-lg transition disabled:opacity-50"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Description */}
                        <div className="mt-4 space-y-3">
                            {isBatch ? (
                                <p className="text-sm text-zinc-300">
                                    Are you sure you want to permanently delete{' '}
                                    <span className="font-semibold text-red-400">
                                        {batchItems.length}
                                    </span>{' '}
                                    items from the database? Every variant of the selected cards is included.
                                </p>
                            ) : (
                                <div>
                                    <p className="text-sm text-zinc-300">
                                        Are you sure you want to delete{' '}
                                        <span className="font-semibold text-white">
                                            "{item?.name || item?.id || 'this item'}"
                                        </span>?
                                    </p>
                                    <span className="inline-block mt-1 text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 uppercase tracking-wider">
                                        {item?.type}
                                    </span>
                                </div>
                            )}

                            {/* Multi-variant options if applicable */}
                            {hasVariants && (
                                <div className="p-3 bg-zinc-900/80 border border-zinc-800 rounded-xl space-y-2 mt-3">
                                    <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300 mb-1">
                                        <Layers className="w-3.5 h-3.5 text-amber-400" />
                                        <span>This item has {item.groupVariants.length} variants:</span>
                                    </div>
                                    <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer p-1.5 rounded hover:bg-zinc-800/50 transition">
                                        <input
                                            type="radio"
                                            name="deleteScope"
                                            value="single"
                                            checked={deleteScope === 'single'}
                                            onChange={() => setDeleteScope('single')}
                                            className="text-red-500 focus:ring-red-500 bg-zinc-800"
                                        />
                                        <span>Delete only this variant ({item.name || item.id})</span>
                                    </label>
                                    <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer p-1.5 rounded hover:bg-zinc-800/50 transition">
                                        <input
                                            type="radio"
                                            name="deleteScope"
                                            value="all_variants"
                                            checked={deleteScope === 'all_variants'}
                                            onChange={() => setDeleteScope('all_variants')}
                                            className="text-red-500 focus:ring-red-500 bg-zinc-800"
                                        />
                                        <span>
                                            Delete all <strong className="text-red-400">{item.groupVariants.length}</strong> variants in this group
                                        </span>
                                    </label>
                                </div>
                            )}

                            {/* Warning alert */}
                            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200/90 text-xs">
                                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                                <span>
                                    This action is permanent and cannot be undone. Unlike hiding, the record will be erased completely from Firestore.
                                </span>
                            </div>

                            {error && (
                                <div className="p-3 rounded-xl bg-red-950/80 border border-red-700 text-red-300 text-xs">
                                    {error}
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="mt-6 flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isDeleting}
                                className="px-4 py-2 text-xs font-semibold rounded-xl border border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:bg-zinc-800 hover:text-white transition disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirm}
                                disabled={isDeleting}
                                className="px-4 py-2 text-xs font-semibold rounded-xl bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isDeleting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span>Deleting...</span>
                                    </>
                                ) : (
                                    <>
                                        <Trash2 className="w-4 h-4" />
                                        <span>Delete Permanently</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
