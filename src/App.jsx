import { useState, useEffect, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import Papa from 'papaparse';
import {
  Vote, TrendingUp, Swords, ArrowLeft, Trophy, BarChart3,
  Info, Stamp, Map, Landmark, MousePointerClick,
} from 'lucide-react';
import './App.css';

// Symbol to color mapping for the top parties
const SYMBOL_COLORS = {
  'ধানের শীষ': '#22c55e',
  'দাঁড়িপাল্লা': '#f59e0b',
  'হাতপাখা': '#ef4444',
  'শাপলা কলি': '#8b5cf6',
  'রিক্সা': '#06b6d4',
  'ফুটবল': '#ec4899',
  'ঘোড়া': '#f97316',
  'লাঙ্গল': '#84cc16',
  'দেওয়াল ঘড়ি': '#14b8a6',
  'কলস': '#6366f1',
};

const DEFAULT_COLOR = '#64748b';

// View modes
const VIEW_MODES = [
  { id: 'total_votes', label: 'মোট ভোট', icon: Vote },
  { id: 'winning_margin', label: 'ব্যবধান', icon: TrendingUp },
  { id: 'competition', label: 'প্রতিযোগিতা', icon: Swords },
];

// Color interpolation helpers
function interpolateColor(color1, color2, factor) {
  const r1 = parseInt(color1.slice(1, 3), 16);
  const g1 = parseInt(color1.slice(3, 5), 16);
  const b1 = parseInt(color1.slice(5, 7), 16);
  const r2 = parseInt(color2.slice(1, 3), 16);
  const g2 = parseInt(color2.slice(3, 5), 16);
  const b2 = parseInt(color2.slice(5, 7), 16);
  const r = Math.round(r1 + (r2 - r1) * factor);
  const g = Math.round(g1 + (g2 - g1) * factor);
  const b = Math.round(b1 + (b2 - b1) * factor);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function getGradientColor(value, min, max, stops) {
  const t = max === min ? 0.5 : (value - min) / (max - min);
  const segmentCount = stops.length - 1;
  const segment = Math.min(Math.floor(t * segmentCount), segmentCount - 1);
  const segmentT = (t * segmentCount) - segment;
  return interpolateColor(stops[segment], stops[segment + 1], segmentT);
}

// Gradient presets — neutral earth/slate tones, distinct from party symbol colors
const GRADIENTS = {
  total_votes: ['#f1f5f9', '#94a3b8', '#475569', '#1e293b', '#020617'],
  winning_margin: ['#fef3e2', '#f0c67a', '#c48432', '#7a4e1a', '#3d2408'],
  competition: ['#164e63', '#5eaec6', '#e5e7eb', '#c88a5e', '#6b3410'],
};

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

function toBn(val) {
  return String(val).replace(/[0-9]/g, (d) => BN_DIGITS[d]);
}

function formatNumber(num) {
  return new Intl.NumberFormat('bn-BD').format(num);
}

function getSymbolColor(symbolName) {
  return SYMBOL_COLORS[symbolName] || DEFAULT_COLOR;
}

function App() {
  const [geoData, setGeoData] = useState(null);
  const [electionData, setElectionData] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('total_votes');

  // Load data
  useEffect(() => {
    Promise.all([
      fetch('/bangladesh.geojson').then((r) => r.json()),
      fetch('/region_symbol_wise_vote_percentage.csv').then((r) => r.text()),
    ]).then(([geo, csvText]) => {
      setGeoData(geo);

      const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
      const grouped = {};
      for (const row of parsed.data) {
        const regionId = parseInt(row.region_id);
        if (!grouped[regionId]) {
          grouped[regionId] = {
            regionId,
            regionName: row.region_name_bn,
            totalVotes: parseInt(row.region_total_votes),
            symbols: [],
          };
        }
        grouped[regionId].symbols.push({
          name: row.symbol_name,
          votes: parseInt(row.symbol_total_votes),
          percentage: parseFloat(row.vote_percentage),
        });
      }
      for (const r of Object.values(grouped)) {
        r.symbols.sort((a, b) => b.votes - a.votes);
        r.winner = r.symbols[0];
        r.runnerUp = r.symbols[1] || null;
        r.winningMargin = r.winner.percentage - (r.runnerUp ? r.runnerUp.percentage : 0);
        r.competitionIndex = r.runnerUp ? r.runnerUp.percentage / r.winner.percentage : 0;
      }
      setElectionData(grouped);
      setLoading(false);
    });
  }, []);

  // Compute ranges for heatmap modes
  const dataRanges = useMemo(() => {
    if (!electionData) return {};
    const regions = Object.values(electionData);
    return {
      totalVotes: {
        min: Math.min(...regions.map((r) => r.totalVotes)),
        max: Math.max(...regions.map((r) => r.totalVotes)),
      },
      winningMargin: {
        min: Math.min(...regions.map((r) => r.winningMargin)),
        max: Math.max(...regions.map((r) => r.winningMargin)),
      },
      competition: {
        min: Math.min(...regions.map((r) => r.competitionIndex)),
        max: Math.max(...regions.map((r) => r.competitionIndex)),
      },
    };
  }, [electionData]);

  const totalStats = useMemo(() => {
    if (!electionData) return null;
    const regions = Object.values(electionData);
    const totalVotes = regions.reduce((sum, r) => sum + r.totalVotes, 0);
    return { totalVotes, totalRegions: regions.length };
  }, [electionData]);

  // Style function based on current view mode
  const styleFeature = useCallback(
    (feature) => {
      if (!electionData) return {};
      const regionId = feature.properties.region_id;
      const region = electionData[regionId];
      if (!region)
        return { fillColor: '#e2e8f0', fillOpacity: 0.3, weight: 0.5, color: '#cbd5e1' };

      let fillColor;
      let fillOpacity = 0.75;

      switch (viewMode) {
        case 'total_votes': {
          const { min, max } = dataRanges.totalVotes;
          fillColor = getGradientColor(region.totalVotes, min, max, GRADIENTS.total_votes);
          fillOpacity = 0.82;
          break;
        }
        case 'winning_margin': {
          const { min, max } = dataRanges.winningMargin;
          fillColor = getGradientColor(region.winningMargin, min, max, GRADIENTS.winning_margin);
          fillOpacity = 0.82;
          break;
        }
        case 'competition': {
          const { min, max } = dataRanges.competition;
          fillColor = getGradientColor(region.competitionIndex, min, max, GRADIENTS.competition);
          fillOpacity = 0.82;
          break;
        }
        default:
          break;
      }

      return {
        fillColor,
        fillOpacity,
        weight: 0.8,
        color: '#cbd5e1',
        opacity: 0.8,
      };
    },
    [electionData, viewMode, dataRanges]
  );

  // Tooltip content based on view mode
  const getTooltipContent = useCallback(
    (region) => {
      let extra = '';
      switch (viewMode) {
        case 'total_votes':
          extra = `<br/>মোট ভোট: ${formatNumber(region.totalVotes)}`;
          break;
        case 'winning_margin':
          extra = `<br/>ব্যবধান: ${toBn(region.winningMargin.toFixed(1))}%`;
          break;
        case 'competition':
          extra = `<br/>প্রতিযোগিতা: ${toBn((region.competitionIndex * 100).toFixed(0))}%`;
          break;
        default:
          extra = `<br/>মোট ভোট: ${formatNumber(region.totalVotes)}`;
      }
      return `<strong>${region.regionName}</strong>${extra}`;
    },
    [viewMode]
  );

  const onEachFeature = useCallback(
    (feature, layer) => {
      if (!electionData) return;
      const regionId = feature.properties.region_id;
      const region = electionData[regionId];
      if (!region) return;

      layer.bindTooltip(getTooltipContent(region), { sticky: true });

      layer.on({
        click: () => setSelectedRegion(regionId),
        mouseover: (e) => {
          e.target.setStyle({
            weight: 2.5,
            color: '#334155',
            fillOpacity: 0.9,
          });
        },
        mouseout: (e) => {
          e.target.setStyle(styleFeature(feature));
        },
      });
    },
    [electionData, styleFeature, getTooltipContent]
  );

  // Gradient legend config per mode
  const gradientLegendConfig = useMemo(() => {
    if (!dataRanges.totalVotes) return null;
    switch (viewMode) {
      case 'total_votes':
        return {
          title: 'মোট ভোট',
          gradient: GRADIENTS.total_votes,
          minLabel: formatNumber(dataRanges.totalVotes.min),
          maxLabel: formatNumber(dataRanges.totalVotes.max),
        };
      case 'winning_margin':
        return {
          title: 'ব্যবধান',
          gradient: GRADIENTS.winning_margin,
          minLabel: `${toBn(dataRanges.winningMargin.min.toFixed(1))}%`,
          maxLabel: `${toBn(dataRanges.winningMargin.max.toFixed(1))}%`,
        };
      case 'competition':
        return {
          title: 'প্রতিযোগিতার মাত্রা',
          gradient: GRADIENTS.competition,
          minLabel: 'কম',
          maxLabel: 'বেশি',
        };
      default:
        return null;
    }
  }, [viewMode, dataRanges]);

  const selectedData = selectedRegion && electionData ? electionData[selectedRegion] : null;

  if (loading) {
    return <div className="loading">নির্বাচনের তথ্য লোড হচ্ছে</div>;
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <h1>
          বাংলাদেশ নির্বাচন <span>২০২৬</span> ফলাফল
        </h1>
        <div className="header-right">
          {/* View mode switcher */}
          <div className="view-switcher">
            {VIEW_MODES.map((mode) => (
              <button
                key={mode.id}
                className={`view-btn ${viewMode === mode.id ? 'active' : ''}`}
                onClick={() => setViewMode(mode.id)}
              >
                <mode.icon size={13} /> {mode.label}
              </button>
            ))}
          </div>
          {totalStats && (
            <div className="header-stats">
              <span>
                ভোট: <strong>{formatNumber(totalStats.totalVotes)}</strong>
              </span>
              <span>
                বিভাগ: <strong>{toBn(totalStats.totalRegions)}</strong>
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="main-content">
        {/* Map */}
        <div className="map-container">
          <MapContainer
            center={[23.8, 90.4]}
            zoom={7}
            scrollWheelZoom={true}
            zoomControl={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {geoData && (
              <GeoJSON
                key={viewMode}
                data={geoData}
                style={styleFeature}
                onEachFeature={onEachFeature}
              />
            )}
          </MapContainer>

          {/* Legend */}
          {gradientLegendConfig && (
            <div className="map-legend">
              <h4>{gradientLegendConfig.title}</h4>
              <div
                className="gradient-bar"
                style={{
                  background: `linear-gradient(to right, ${gradientLegendConfig.gradient.join(', ')})`,
                }}
              />
              <div className="gradient-labels">
                <span>{gradientLegendConfig.minLabel}</span>
                <span>{gradientLegendConfig.maxLabel}</span>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="sidebar">
          {selectedData ? (
            <>
              <div className="sidebar-header">
                <button className="back-btn" onClick={() => setSelectedRegion(null)}>
                  <ArrowLeft size={14} /> ফিরে যান
                </button>
                <h2>{selectedData.regionName} বিভাগ</h2>
                <p>বিভাগীয় নির্বাচনের ফলাফল</p>
              </div>

              {/* Winner */}
              <div className="winner-banner">
                <div
                  className="winner-color-dot"
                  style={{ backgroundColor: getSymbolColor(selectedData.winner.name) }}
                >
                  <Trophy size={20} color="#fff" />
                </div>
                <div className="winner-info">
                  <h3>{selectedData.winner.name}</h3>
                  <div
                    className="winner-pct"
                    style={{ color: getSymbolColor(selectedData.winner.name) }}
                  >
                    {toBn(selectedData.winner.percentage)}%
                  </div>
                  <div className="winner-votes">
                    {formatNumber(selectedData.winner.votes)} ভোট
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="region-stats">
                <div className="stat-box">
                  <div className="label"><Vote size={12} /> মোট ভোট</div>
                  <div className="value">{formatNumber(selectedData.totalVotes)}</div>
                </div>
                <div className="stat-box">
                  <div className="label"><TrendingUp size={12} /> ব্যবধান</div>
                  <div className="value">{toBn(selectedData.winningMargin.toFixed(1))}%</div>
                </div>
                <div className="stat-box">
                  <div className="label"><Stamp size={12} /> প্রতীক</div>
                  <div className="value">{toBn(selectedData.symbols.length)}</div>
                </div>
                <div className="stat-box">
                  <div className="label"><Swords size={12} /> প্রতিযোগিতা</div>
                  <div className="value">
                    {toBn((selectedData.competitionIndex * 100).toFixed(0))}%
                  </div>
                </div>
              </div>

              {/* All results */}
              <div className="results-list">
                <h4><BarChart3 size={13} /> সকল ফলাফল ({toBn(selectedData.symbols.length)} প্রতীক)</h4>
                {selectedData.symbols.slice(0, 15).map((symbol, i) => (
                  <div key={symbol.name} className="result-item">
                    <span className="result-rank">{toBn(i + 1)}</span>
                    <div className="result-bar-wrapper">
                      <div className="result-name">
                        <span>{symbol.name}</span>
                        <span className="pct">{toBn(symbol.percentage)}%</span>
                      </div>
                      <div className="result-bar">
                        <div
                          className="result-bar-fill"
                          style={{
                            width: `${(symbol.percentage / selectedData.winner.percentage) * 100}%`,
                            backgroundColor: getSymbolColor(symbol.name),
                          }}
                        />
                      </div>
                    </div>
                    <span className="result-votes">{formatNumber(symbol.votes)}</span>
                  </div>
                ))}
                {selectedData.symbols.length > 15 && (
                  <p style={{ fontSize: '0.7rem', color: '#475569', marginTop: '8px' }}>
                    + {toBn(selectedData.symbols.length - 15)} আরও প্রতীক
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="sidebar-about">
              <div className="about-header">
                <h2><Info size={16} /> তথ্য সম্পর্কে</h2>
              </div>

              <div className="about-section">
                <h3>সারসংক্ষেপ</h3>
                <p>
                  এই ইন্টারেক্টিভ মানচিত্রে <strong>বাংলাদেশ জাতীয় সংসদ নির্বাচন
                  ২০২৬</strong>-এর ফলাফল প্রদর্শিত হচ্ছে, যেখানে বাংলাদেশের ৮টি
                  প্রশাসনিক বিভাগের ভোটের বিন্যাস দেখানো হয়েছে।
                </p>
              </div>

              <div className="about-section">
                <h3><Stamp size={13} /> প্রতীক কী?</h3>
                <p>
                  বাংলাদেশের নির্বাচনে প্রতিটি রাজনৈতিক দল বা স্বতন্ত্র প্রার্থীকে
                  একটি নির্দিষ্ট <strong>নির্বাচনী প্রতীক</strong> দেওয়া হয় যা
                  ব্যালট পেপারে প্রদর্শিত হয়। ভোটাররা তাদের পছন্দের প্রার্থীর
                  প্রতীকে সিল মেরে ভোট দেন। প্রধান প্রতীকসমূহ:
                </p>
                <ul className="symbol-list">
                  <li><span className="sym-dot" style={{background: '#22c55e'}}></span><strong>ধানের শীষ</strong></li>
                  <li><span className="sym-dot" style={{background: '#f59e0b'}}></span><strong>দাঁড়িপাল্লা</strong></li>
                  <li><span className="sym-dot" style={{background: '#ef4444'}}></span><strong>হাতপাখা</strong></li>
                  <li><span className="sym-dot" style={{background: '#8b5cf6'}}></span><strong>শাপলা কলি</strong></li>
                  <li><span className="sym-dot" style={{background: '#06b6d4'}}></span><strong>রিক্সা</strong></li>
                </ul>
              </div>

              <div className="about-section">
                <h3><Map size={13} /> মানচিত্র ভিউ</h3>
                <ul className="view-desc-list">
                  <li>
                    <strong>মোট ভোট</strong> — প্রতিটি বিভাগে প্রদত্ত মোট ভোটের সংখ্যা
                    দেখায়। গাঢ়/উষ্ণ রঙ বেশি ভোটার উপস্থিতি নির্দেশ করে। ঢাকা ও
                    চট্টগ্রাম বিভাগে সবচেয়ে বেশি ভোট পড়েছে।
                  </li>
                  <li>
                    <strong>ব্যবধান</strong> — প্রতিটি বিভাগে ১ম ও ২য় স্থানের
                    প্রতীকের মধ্যে শতাংশের পার্থক্য দেখায়। বেশি ব্যবধান মানে
                    নিশ্চিত জয়; কম ব্যবধান মানে কঠিন প্রতিদ্বন্দ্বিতা।
                  </li>
                  <li>
                    <strong>প্রতিযোগিতা</strong> — রানার-আপের ভোট ও বিজয়ীর ভোটের
                    অনুপাত ব্যবহার করে প্রতিযোগিতার মাত্রা পরিমাপ করে। উচ্চ মান
                    তীব্র প্রতিযোগিতা নির্দেশ করে; নিম্ন মান একতরফা ফলাফল নির্দেশ করে।
                  </li>
                </ul>
              </div>

              <div className="about-section">
                <h3><Landmark size={13} /> বিভাগসমূহ</h3>
                <p>
                  বাংলাদেশ ৮টি প্রশাসনিক বিভাগে বিভক্ত: বরিশাল, চট্টগ্রাম,
                  ঢাকা, খুলনা, ময়মনসিংহ, রাজশাহী, রংপুর এবং সিলেট।
                  প্রতিটি বিভাগে এর সীমানার মধ্যে সকল নির্বাচনী এলাকার ফলাফল একত্রিত করা হয়েছে।
                </p>
              </div>

              <div className="about-cta">
                <MousePointerClick size={14} /> বিস্তারিত ফলাফল দেখতে মানচিত্রে যেকোনো বিভাগে ক্লিক করুন।
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default App;
