import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../../core/firebase-config.js';
import { doc, updateDoc } from 'firebase/firestore';
import { Search, Plus, X, Globe, MapPin, Loader2 } from 'lucide-react';
import { getCountryDisplayName, normalizeScoringLanguage, scoringCopy } from './scoringI18n';
import { getScoringThemeStyleVars, getStoredScoringAccent, getStoredScoringTheme } from './scoringTheme';
import { buildNumberedParticipant } from './participantUtils';

export default function ParticipantSetup({ session }) {
  const [theme] = useState(getStoredScoringTheme());
  const [accentColor] = useState(getStoredScoringAccent());
  const [countries, setCountries] = useState([]);
  const [queryCountry, setQueryCountry] = useState('');
  const [countryResults, setCountryResults] = useState([]);
  const [selectedParentCountry, setSelectedParentCountry] = useState(null);
  const [cities, setCities] = useState([]);
  const [queryCity, setQueryCity] = useState('');
  const [cityResults, setCityResults] = useState([]);
  const [selectedParticipants, setSelectedParticipants] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);

  const countryDropdownRef = useRef(null);
  const cityDropdownRef = useRef(null);
  const language = normalizeScoringLanguage(session?.language);
  const t = scoringCopy[language]?.participantSetup || scoringCopy.es.participantSetup;

  // Click-outside handler to close dropdowns
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (countryDropdownRef.current && !countryDropdownRef.current.contains(e.target)) {
        setCountryResults([]);
      }
      if (cityDropdownRef.current && !cityDropdownRef.current.contains(e.target)) {
        setCityResults([]);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    fetch('https://restcountries.com/v3.1/all?fields=name,translations,cca3,flag')
      .then(res => res.json())
      .then(data => {
        const parsed = data.map(c => ({
          name: getCountryDisplayName(c, language),
          apiName: c.name?.common || '',
          flag: c.flag || '',
          id: c.cca3 || Math.random().toString()
        }))
        .filter(c => c.name)
        .sort((a,b) => a.name.localeCompare(b.name));
        setCountries(parsed);
      })
      .catch(err => console.error("Error fetching countries", err));
  }, [language]);

  useEffect(() => {
    if (session.type === 'Nacional' && selectedParentCountry) {
      setCities([]);
      setLoadingCities(true);
      fetch('https://countriesnow.space/api/v0.1/countries/cities', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ country: selectedParentCountry.apiName || selectedParentCountry.name })
      })
      .then(res => res.json())
      .then(data => {
        if(!data.error && data.data) {
          setCities(data.data.map(c => ({
            name: c,
            id: c.replace(/\s+/g, '').toUpperCase(),
            flag: selectedParentCountry.flag
          })));
        }
      })
      .catch(err => console.error("Error fetching cities", err))
      .finally(() => setLoadingCities(false));
    }
  }, [session.type, selectedParentCountry]);

  useEffect(() => {
    if (queryCountry.length > 1) {
      setCountryResults(countries.filter(c => c.name.toLowerCase().includes(queryCountry.toLowerCase())).slice(0, 15));
    } else {
      setCountryResults([]);
    }
  }, [queryCountry, countries]);

  useEffect(() => {
    if (queryCity.length > 1) {
      setCityResults(cities.filter(c => c.name.toLowerCase().includes(queryCity.toLowerCase())).slice(0, 15));
    } else {
      setCityResults([]);
    }
  }, [queryCity, cities]);

  const handleAddGlobal = (country) => {
    setSelectedParticipants(prev => [...prev, buildNumberedParticipant(country, prev, 'country')]);
    setQueryCountry('');
    setCountryResults([]);
  };

  const handleAddNational = (city) => {
    setSelectedParticipants(prev => [...prev, buildNumberedParticipant(city, prev, 'city')]);
    setQueryCity('');
    setCityResults([]);
  };

  const handleRemove = (id) => {
    setSelectedParticipants(prev => prev.filter(p => p.id !== id));
  };

  const handleStart = async () => {
    if (selectedParticipants.length === 0) return;
    setSubmitting(true);
    try {
      await updateDoc(doc(db, "sessions", session.id), { participants: selectedParticipants });
    } catch(err) {
      console.error(err);
      setSubmitting(false);
    }
  };

  return (
    <div 
      className={`theme-scoring-${theme} min-h-screen bg-app-bg text-app-text font-sans flex justify-center p-4 md:p-10`}
      style={getScoringThemeStyleVars(accentColor)}
    >
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-6 h-fit">
        
        {/* Search Panel */}
        <div className="scoring-panel rounded-2xl p-6 h-fit">
          <div className="mb-5">
            <h2 className="text-xl font-bold text-app-text mb-1 flex items-center gap-2">
              {session.type === 'Global' ? <Globe className="w-5 h-5 text-app-accent opacity-70"/> : <MapPin className="w-5 h-5 text-app-accent opacity-70"/>}
              {t.title}
            </h2>
            <p className="text-app-muted/80 text-sm">{t.subtitle}</p>
          </div>

          {session.type === 'Global' && (
            <div className="relative" ref={countryDropdownRef}>
              <div className="relative">
                <input 
                  type="text" value={queryCountry} onChange={e => setQueryCountry(e.target.value)}
                  placeholder={t.countrySearchPlaceholder}
                  className="scoring-input w-full rounded-xl h-12 pl-12 pr-4 text-sm"
                />
                <Search className="w-5 h-5 text-app-muted/70 absolute left-4 top-3.5" />
              </div>
              <AnimatePresence>
                {countryResults.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="scoring-popover absolute top-14 left-0 right-0 rounded-xl overflow-hidden z-30 max-h-60 overflow-y-auto p-1 custom-scrollbar"
                  >
                    {countryResults.map(item => (
                      <button key={item.id} onClick={() => handleAddGlobal(item)} 
                        className="scoring-popover-option w-full flex items-center gap-3 p-3 text-left rounded-lg group">
                        {item.flag && <span className="text-xl group-hover:scale-110 transition-transform">{item.flag}</span>}
                        <span className="scoring-popover-secondary font-medium text-sm">{item.name}</span>
                        <Plus className="scoring-popover-icon w-4 h-4 text-app-accent ml-auto shrink-0 transition-colors" />
                      </button>
                    ))}
                  </motion.div>
                )}
                {queryCountry.trim().length > 1 && countryResults.length === 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="scoring-popover absolute top-14 left-0 right-0 rounded-xl p-6 z-30 text-center"
                  >
                    <p className="text-sm text-app-muted mb-4 opacity-70">{t.notFound}</p>
                    <button
                      onClick={() => handleAddGlobal({ name: queryCountry.trim(), id: queryCountry.trim().replace(/\s+/g, '').toUpperCase(), flag: '🏳️' })}
                      className="scoring-btn-primary text-xs px-5 py-2.5 rounded-xl font-bold uppercase tracking-widest shadow-lg"
                    >
                      {t.addManualEntry(queryCountry)}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {session.type === 'Nacional' && (
            <div className="space-y-6">
              {!selectedParentCountry ? (
                <div className="relative" ref={countryDropdownRef}>
                  <label className="block text-xs font-bold tracking-widest text-app-muted/80 uppercase mb-2">{t.hostCountryStep}</label>
                  <div className="relative">
                    <input 
                      type="text" value={queryCountry} onChange={e => setQueryCountry(e.target.value)}
                      placeholder={t.hostCountryPlaceholder}
                      className="scoring-input w-full rounded-xl h-12 pl-12 pr-4 text-sm"
                    />
                    <Search className="w-5 h-5 text-app-muted/70 absolute left-4 top-3.5" />
                  </div>
                  <AnimatePresence>
                    {countryResults.length > 0 && (
                      <motion.div 
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="scoring-popover absolute top-[75px] left-0 right-0 rounded-xl overflow-hidden z-30 max-h-60 overflow-y-auto p-1 custom-scrollbar"
                      >
                        {countryResults.map(c => (
                          <button key={c.id} onClick={() => { setSelectedParentCountry(c); setQueryCountry(''); setCountryResults([]); }} 
                            className="scoring-popover-option w-full flex items-center gap-3 p-3 text-left rounded-lg group">
                            <span className="text-xl group-hover:scale-110 transition-transform">{c.flag}</span>
                            <span className="scoring-popover-secondary font-medium text-sm">{c.name}</span>
                          </button>
                        ))}
                      </motion.div>
                    )}
                    {queryCountry.trim().length > 1 && countryResults.length === 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="scoring-popover absolute top-[75px] left-0 right-0 rounded-xl p-6 z-30 text-center"
                      >
                        <p className="text-sm text-app-muted mb-4 opacity-70">{t.notFound}</p>
                        <button
                          onClick={() => {
                            const manualCountry = {
                              name: queryCountry.trim(),
                              apiName: queryCountry.trim(),
                              id: queryCountry.trim().replace(/\s+/g, '').toUpperCase(),
                              flag: '🏳️'
                            };
                            setSelectedParentCountry(manualCountry);
                            setQueryCountry('');
                            setCountryResults([]);
                          }}
                          className="scoring-btn-primary text-xs px-5 py-2.5 rounded-xl font-bold uppercase tracking-widest shadow-lg"
                        >
                          {t.addManualEntry(queryCountry)}
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="bg-app-card/50 border border-app-border/80 p-4 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{selectedParentCountry.flag}</span>
                      <div>
                        <p className="text-xs text-app-muted/80 uppercase tracking-widest">{t.nationalHostLabel}</p>
                        <p className="text-app-text font-medium">{selectedParentCountry.name}</p>
                      </div>
                    </div>
                    <button onClick={() => {setSelectedParentCountry(null); setCities([]); setSelectedParticipants([]);}} className="text-xs text-app-muted hover:text-app-text underline decoration-app-border underline-offset-4 transition-colors">{t.changeHostCountry}</button>
                  </div>
                  
                  <div className="relative" ref={cityDropdownRef}>
                    <label className="block text-xs font-bold tracking-widest text-app-muted/80 uppercase mb-2">{t.cityStep}</label>
                    <div className="relative">
                      <input 
                        type="text" value={queryCity} onChange={e => setQueryCity(e.target.value)}
                        disabled={loadingCities}
                        placeholder={loadingCities ? t.loadingCities : t.citySearchPlaceholder}
                        className="scoring-input w-full rounded-xl h-12 pl-12 pr-4 text-sm disabled:opacity-40"
                      />
                      <Search className="w-5 h-5 text-app-muted/70 absolute left-4 top-3.5" />
                    </div>
                    
                    <AnimatePresence>
                      {cityResults.length > 0 && (
                        <motion.div 
                          initial={{ opacity: 0, y: -10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className="scoring-popover absolute mt-2 left-0 right-0 rounded-xl overflow-hidden z-30 max-h-60 overflow-y-auto p-1 custom-scrollbar"
                        >
                          {cityResults.map(c => (
                            <button key={c.id} onClick={() => handleAddNational(c)} 
                              className="scoring-popover-option w-full flex items-center gap-3 p-3 text-left rounded-lg group">
                              <span className="scoring-popover-secondary font-medium text-sm">{c.name}</span>
                              <Plus className="scoring-popover-icon w-4 h-4 text-app-accent ml-auto shrink-0 transition-colors" />
                            </button>
                          ))}
                        </motion.div>
                      )}
                      {queryCity.length > 1 && cityResults.length === 0 && cities.length > 0 && !loadingCities && (
                        <motion.div 
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="scoring-popover absolute mt-2 left-0 right-0 rounded-xl p-6 z-30 text-center"
                        >
                          <p className="text-sm text-app-muted mb-4 opacity-70">{t.notFound}</p>
                          <button onClick={() => handleAddNational({name: queryCity.trim(), id: queryCity.replace(/\s+/g,'').toUpperCase(), flag: selectedParentCountry.flag})} 
                            className="scoring-btn-primary text-xs px-5 py-2.5 rounded-xl font-bold uppercase tracking-widest shadow-lg">
                            {t.addManualEntry(queryCity)}
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Roster Table */}
        <div className="scoring-panel rounded-2xl p-6 flex flex-col min-h-[420px]">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-bold text-app-text uppercase tracking-widest">{t.rosterTitle}</h3>
            <span className="bg-app-accent text-app-bg text-[10px] px-2.5 py-1 rounded-md font-mono font-bold shadow-[0_0_10px_var(--color-app-accent-muted)]">{selectedParticipants.length}</span>
          </div>

          <div className="flex-grow overflow-y-auto border border-app-border rounded-xl bg-app-card/30 mb-6">
            {selectedParticipants.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-app-muted/50 p-8 text-center gap-3">
                <Globe className="w-10 h-10 opacity-20" />
                <p className="text-sm">{t.emptyTitle}<br/><span className="text-app-muted/40">{t.emptySubtitle}</span></p>
              </div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-app-border/30 sticky top-0 border-b border-app-border z-10 text-xs tracking-wider text-app-muted/70 uppercase">
                  <tr>
                    <th className="font-normal py-3 pl-4 pr-2 w-10">#</th>
                    <th className="font-normal py-3 px-2">{t.contestantHeader}</th>
                    <th className="font-normal py-3 pr-4 text-right w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {selectedParticipants.map((p, i) => (
                    <tr key={p.id} className="hover:bg-app-border/30 transition-colors group">
                      <td className="py-3 pl-4 pr-2 text-xl">{p.flag}</td>
                      <td className="py-3 px-2 font-medium text-app-text">{p.name}</td>
                      <td className="py-3 pr-4 text-right">
                        <button onClick={() => handleRemove(p.id)} className="w-6 h-6 flex items-center justify-center rounded bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-colors ml-auto opacity-0 group-hover:opacity-100" title={t.removeParticipant} aria-label={`${t.removeParticipant}: ${p.name}`}>
                          <X className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <button 
            onClick={handleStart} 
            disabled={selectedParticipants.length === 0 || submitting}
            className="scoring-btn-primary w-full h-14 font-bold uppercase tracking-widest text-sm rounded-xl disabled:opacity-20 disabled:shadow-none disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> {t.saveBusy}</> : t.startEvent(selectedParticipants.length)}
          </button>
        </div>
      </div>
    </div>
  );
}
