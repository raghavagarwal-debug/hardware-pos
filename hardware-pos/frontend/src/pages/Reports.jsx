import { useEffect, useState } from 'react';
import { api } from '../api';

const TABS = [
  { key: 'daily', label: 'Daily Movement' },
  { key: 'monthly', label: 'Monthly Movement' },
  { key: 'fastMoving', label: 'Fast Moving' },
  { key: 'slowMoving', label: 'Slow Moving' },
];

export default function Reports() {
  const [tab, setTab] = useState('daily');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  // const [range, setRange] = useState({ from: '2000-01-01', to: new Date().toISOString().slice(0, 10) });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState('custom');
  const [reportRange, setReportRange] = useState({
    from: new Date(new Date().setMonth(new Date().getMonth() - 2))
      .toISOString()
      .slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
  });

  const handlePresetChange = (value) => {
    setPreset(value);
    if (value === 'custom') return;

    const toDate = new Date();
    const fromDate = new Date();

    if (value === '10days') {
      fromDate.setDate(fromDate.getDate() - 10);
    } else if (value === '1month') {
      fromDate.setMonth(fromDate.getMonth() - 1);
    } else if (value === '3months') {
      fromDate.setMonth(fromDate.getMonth() - 3);
    } else if (value === '5months') {
      fromDate.setMonth(fromDate.getMonth() - 5);
    }

    setReportRange({
      from: fromDate.toISOString().slice(0, 10),
      to: toDate.toISOString().slice(0, 10),
    });
  };

  const handleTabChange = (newTab) => {
    setTab(newTab);
    setData(null);
  };

  async function load() {
    setLoading(true);
    try {
      if (tab === 'daily') setData(await api.reports.dailyMovement(date));
      else if (tab === 'monthly') setData(await api.reports.monthlyMovement(month));
      else if (tab === 'fastMoving')
        setData(
          await api.reports.fastMoving(
            reportRange.from,
            reportRange.to
          )
        );

      else if (tab === 'slowMoving')
        setData(
          await api.reports.slowMoving(
            reportRange.from,
            reportRange.to
          )
        );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [tab, date, month, reportRange.from, reportRange.to]);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Inventory Reports</div>
          <div className="page-sub">Roll-ups drawn straight from the full transaction ledger.</div>
        </div>
      </div>

      <div className="card">
        <div className="filters-bar" style={{ marginBottom: 18 }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`btn btn-sm ${tab === t.key ? 'btn-primary' : ''}`}
              onClick={() => handleTabChange(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'daily' && (
          <div className="field" style={{ maxWidth: 200, marginBottom: 16 }}>
            <label>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        )}
        {tab === 'monthly' && (
          <div className="field" style={{ maxWidth: 200, marginBottom: 16 }}>
            <label>Month</label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
        )}
        {(tab === 'fastMoving' || tab === 'slowMoving') && (
          <div
            className="field-row"
            style={{
              maxWidth: 700,
              marginBottom: 20,
              display: 'flex',
              gap: 16,
              alignItems: 'flex-end',
              flexWrap: 'wrap'
            }}
          >
            <div className="field" style={{ minWidth: 150 }}>
              <label>Period Preset</label>
              <select
                value={preset}
                onChange={(e) => handlePresetChange(e.target.value)}
                style={{
                  padding: '8px',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--line-strong)',
                  background: 'var(--paper-raised)',
                  fontSize: '13.5px',
                  height: '38px',
                  width: '100%'
                }}
              >
                <option value="custom">Custom Range</option>
                <option value="10days">Last 10 Days</option>
                <option value="1month">Last 1 Month</option>
                <option value="3months">Last 3 Months</option>
                <option value="5months">Last 5 Months</option>
              </select>
            </div>

            <div className="field" style={{ opacity: preset === 'custom' ? 1 : 0.65 }}>
              <label>From</label>
              <input
                type="date"
                value={reportRange.from}
                disabled={preset !== 'custom'}
                onChange={(e) =>
                  setReportRange({
                    ...reportRange,
                    from: e.target.value
                  })
                }
              />
            </div>

            <div className="field" style={{ opacity: preset === 'custom' ? 1 : 0.65 }}>
              <label>To</label>
              <input
                type="date"
                value={reportRange.to}
                disabled={preset !== 'custom'}
                onChange={(e) =>
                  setReportRange({
                    ...reportRange,
                    to: e.target.value
                  })
                }
              />
            </div>
          </div>
        )}
        {loading || !data ? <div className="empty-state">Loading report…</div> : <ReportBody tab={tab} data={data} />}
      </div>
    </div>
  );
}

function ReportBody({ tab, data }) {
  if (!data) return null;

  if (tab === 'daily' || tab === 'monthly') {
    const rows = data.movement || [];
    if (!rows.length) return <div className="empty-state">No stock movement in this period.</div>;
    return (
      <div className="table-responsive">
        <table className="ledger">
          <thead><tr><th>Product</th><th className="num">Stock Out</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.product_name}</td>
                <td
                  className="num qty-out"
                  style={{ fontWeight: 600 }}
                >
                  {Math.abs(r.stock_out)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (tab === 'fastMoving' || tab === 'slowMoving') {
    const rows = (tab === 'fastMoving' ? data.fastMoving : data.slowMoving) || [];
    if (!rows.length) return <div className="empty-state">No sales data yet.</div>;
    return (
      <div className="table-responsive">
        <table className="ledger">
          <thead><tr><th>Product</th><th className="num">Units Sold</th><th>Last Sale</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.product_name}</td>
                <td className="num" style={{ fontWeight: 600 }}>{r.units_sold}</td>
                <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{r.last_sale ? new Date(r.last_sale).toLocaleString() : 'Never sold'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return null;
}
