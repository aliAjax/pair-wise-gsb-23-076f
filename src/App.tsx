import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import "./styles.css";

type Level = "正常" | "关注" | "异常";
type Status = "待处理" | "处理中" | "已关闭";
type Role = "巡检员" | "厂务工程师";

interface InspectionRecord {
  id: string;
  room: string;
  cls: string;
  particles: number; // 0.5μm 粒子数，个/m³
  temperature: number; // ℃
  humidity: number; // %RH
  pressure: number; // Pa
  level: Level; // 系统判定，不允许手填
  status: Status;
  note: string; // 处理说明
  createdBy: Role;
  createdAt: string;
  updatedAt: string;
}

// ISO 14644-1 各等级 0.5μm 粒子上限（个/m³）
const CLASS_LIMITS: Record<string, number> = {
  "ISO 5": 3520,
  "ISO 6": 35200,
  "ISO 7": 352000,
  "ISO 8": 3520000,
};

const CLASS_OPTIONS = Object.keys(CLASS_LIMITS);
const WATCH_RATIO = 0.8; // 达到上限 80% 判关注，超限判异常

const LEVELS: Level[] = ["正常", "关注", "异常"];
const STATUSES: Status[] = ["待处理", "处理中", "已关闭"];
const ROLES: Role[] = ["巡检员", "厂务工程师"];

const RECORDS_KEY = "hxwl-09.cleanroom.records.v1";
const ROLE_KEY = "hxwl-09.cleanroom.role.v1";

function judgeLevel(cls: string, particles: number): Level {
  const limit = CLASS_LIMITS[cls];
  if (particles > limit) return "异常";
  if (particles >= limit * WATCH_RATIO) return "关注";
  return "正常";
}

function nowText() {
  return new Date().toLocaleString("zh-CN", { hour12: false });
}

function fmt(n: number) {
  return n.toLocaleString("zh-CN");
}

function seedRecords(): InspectionRecord[] {
  const now = nowText();
  return [
    {
      id: "seed-cr1201",
      room: "CR-1201",
      cls: "ISO 5",
      particles: 5200,
      temperature: 22.4,
      humidity: 46,
      pressure: 12,
      level: "异常",
      status: "待处理",
      note: "",
      createdBy: "巡检员",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "seed-y0302",
      room: "Y-0302",
      cls: "ISO 7",
      particles: 300000,
      temperature: 23.1,
      humidity: 58,
      pressure: 9,
      level: "关注",
      status: "待处理",
      note: "",
      createdBy: "巡检员",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "seed-cr2107",
      room: "CR-2107",
      cls: "ISO 6",
      particles: 12000,
      temperature: 22.5,
      humidity: 48,
      pressure: 15,
      level: "正常",
      status: "已关闭",
      note: "粒子数在限值内，自动归档",
      createdBy: "巡检员",
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function loadRecords(): InspectionRecord[] {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    if (!raw) return seedRecords();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return seedRecords();
    return parsed as InspectionRecord[];
  } catch {
    return seedRecords();
  }
}

function loadRole(): Role {
  const raw = localStorage.getItem(ROLE_KEY);
  return raw === "厂务工程师" ? "厂务工程师" : "巡检员";
}

const levelClass: Record<Level, string> = {
  正常: "badge level-ok",
  关注: "badge level-watch",
  异常: "badge level-danger",
};

const statusClass: Record<Status, string> = {
  待处理: "badge status-pending",
  处理中: "badge status-doing",
  已关闭: "badge status-done",
};

const emptyForm = {
  room: "",
  cls: "ISO 5",
  particles: "",
  temperature: "",
  humidity: "",
  pressure: "",
};

function App() {
  const [records, setRecords] = useState<InspectionRecord[]>(loadRecords);
  const [role, setRole] = useState<Role>(loadRole);
  const [classFilter, setClassFilter] = useState("全部");
  const [levelFilter, setLevelFilter] = useState<"全部" | Level>("全部");
  const [statusFilter, setStatusFilter] = useState<"全部" | Status>("全部");
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  }, [records]);

  useEffect(() => {
    localStorage.setItem(ROLE_KEY, role);
  }, [role]);

  const metrics = useMemo(
    () => [
      { label: "记录总数", value: records.length, tone: "status-ok" },
      { label: "判定关注", value: records.filter((r) => r.level === "关注").length, tone: "status-watch" },
      { label: "判定异常", value: records.filter((r) => r.level === "异常").length, tone: "status-danger" },
      { label: "待处理", value: records.filter((r) => r.status === "待处理").length, tone: "status-danger" },
    ],
    [records]
  );

  const visibleRecords = useMemo(
    () =>
      records.filter(
        (r) =>
          (classFilter === "全部" || r.cls === classFilter) &&
          (levelFilter === "全部" || r.level === levelFilter) &&
          (statusFilter === "全部" || r.status === statusFilter)
      ),
    [records, classFilter, levelFilter, statusFilter]
  );

  const isEngineer = role === "厂务工程师";
  const currentLimit = CLASS_LIMITS[form.cls];

  function updateForm(key: keyof typeof emptyForm, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addRecord(event: FormEvent) {
    event.preventDefault();
    const room = form.room.trim();
    const particles = Number(form.particles);
    const temperature = Number(form.temperature);
    const humidity = Number(form.humidity);
    const pressure = Number(form.pressure);

    if (!room) {
      setFormError("请填写房间编号");
      return;
    }
    if (form.particles.trim() === "" || !Number.isFinite(particles) || particles < 0) {
      setFormError("请填写有效的 0.5μm 粒子数（≥0）");
      return;
    }
    if (form.temperature.trim() === "" || !Number.isFinite(temperature)) {
      setFormError("请填写有效的温度");
      return;
    }
    if (form.humidity.trim() === "" || !Number.isFinite(humidity) || humidity < 0 || humidity > 100) {
      setFormError("请填写有效的湿度（0–100 %RH）");
      return;
    }
    if (form.pressure.trim() === "" || !Number.isFinite(pressure)) {
      setFormError("请填写有效的压差");
      return;
    }

    const level = judgeLevel(form.cls, particles);
    const now = nowText();
    const record: InspectionRecord = {
      id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      room,
      cls: form.cls,
      particles,
      temperature,
      humidity,
      pressure,
      level,
      status: level === "正常" ? "已关闭" : "待处理",
      note: level === "正常" ? "粒子数在限值内，自动归档" : "",
      createdBy: role,
      createdAt: now,
      updatedAt: now,
    };

    setRecords((prev) => [record, ...prev]);
    setForm({ ...emptyForm, cls: form.cls });
    setFormError("");
    setNotice(
      level === "正常"
        ? `${room} 已登记，系统判定：正常，已自动归档`
        : `${room} 已登记，系统判定：${level}，待厂务工程师处理`
    );
  }

  function startHandling(id: string) {
    if (!isEngineer) {
      setNotice("当前是巡检员视角，请切换到厂务工程师后再推进处置");
      return;
    }
    const now = nowText();
    setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, status: "处理中", updatedAt: now } : r)));
    setNotice("已推进到处理中");
  }

  function closeRecord(id: string) {
    if (!isEngineer) {
      setNotice("当前是巡检员视角，请切换到厂务工程师后再关闭记录");
      return;
    }
    const note = (noteDrafts[id] ?? "").trim();
    const now = nowText();
    setRecords((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        if (!note) {
          // 没写处理说明：保留待处理
          return { ...r, status: "待处理", updatedAt: now };
        }
        return { ...r, status: "已关闭", note, updatedAt: now };
      })
    );
    if (note) {
      setNoteDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setNotice("处理说明已记录，记录已关闭");
    } else {
      setNotice("未填写处理说明，记录保留为待处理");
    }
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-09 · port 5109</p>
          <h1>半导体洁净室巡检</h1>
          <p className="subtitle">
            登记房间检测数据，系统按洁净等级对应的 0.5μm 粒子上限自动判定正常、关注或异常；异常与关注记录由厂务工程师推进处置并填写处理说明后关闭，台账保存在本浏览器中。
          </p>
        </div>
        <div className="stack-card">
          <span>当前角色</span>
          <div className="role-switch">
            {ROLES.map((r) => (
              <button
                key={r}
                className={r === role ? "role-btn active" : "role-btn"}
                onClick={() => {
                  setRole(r);
                  setNotice(r === "厂务工程师" ? "已切换到厂务工程师，可推进和关闭记录" : "已切换到巡检员，可登记巡检记录");
                }}
              >
                {r}
              </button>
            ))}
          </div>
          <span className="role-hint">
            {isEngineer ? "可将待处理推进到处理中，并填写说明后关闭" : "登记检测数据；处置需切换到厂务工程师"}
          </span>
        </div>
      </section>

      <section className="metrics-grid">
        {metrics.map((metric) => (
          <article key={metric.label} className="metric-card">
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <i className={metric.tone} />
          </article>
        ))}
      </section>

      {notice && <p className="notice">{notice}</p>}

      <section className="workspace">
        <aside className="panel narrow">
          <h2>洁净等级</h2>
          <div className="chips">
            {["全部", ...CLASS_OPTIONS].map((c) => (
              <button key={c} className={classFilter === c ? "chip active" : "chip"} onClick={() => setClassFilter(c)}>
                {c}
              </button>
            ))}
          </div>
          <h2>系统判定</h2>
          <div className="chips">
            {(["全部", ...LEVELS] as const).map((l) => (
              <button key={l} className={levelFilter === l ? "chip active" : "chip"} onClick={() => setLevelFilter(l)}>
                {l}
              </button>
            ))}
          </div>
          <h2>处置状态</h2>
          <div className="chips">
            {(["全部", ...STATUSES] as const).map((s) => (
              <button key={s} className={statusFilter === s ? "chip active" : "chip"} onClick={() => setStatusFilter(s)}>
                {s}
              </button>
            ))}
          </div>
        </aside>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p>洁净室巡检</p>
              <h2>新增巡检记录</h2>
            </div>
          </div>
          <form className="field-grid" onSubmit={addRecord}>
            <label>
              <span>房间编号</span>
              <input
                value={form.room}
                onChange={(e) => updateForm("room", e.target.value)}
                placeholder="如 CR-1201"
              />
            </label>
            <label>
              <span>洁净等级</span>
              <select value={form.cls} onChange={(e) => updateForm("cls", e.target.value)}>
                {CLASS_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}（上限 {fmt(CLASS_LIMITS[c])} 个/m³）
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>0.5μm 粒子数（个/m³）</span>
              <input
                type="number"
                min="0"
                value={form.particles}
                onChange={(e) => updateForm("particles", e.target.value)}
                placeholder={`${form.cls} 上限 ${fmt(currentLimit)}`}
              />
            </label>
            <label>
              <span>温度（℃）</span>
              <input
                type="number"
                step="0.1"
                value={form.temperature}
                onChange={(e) => updateForm("temperature", e.target.value)}
                placeholder="如 22.5"
              />
            </label>
            <label>
              <span>湿度（%RH）</span>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={form.humidity}
                onChange={(e) => updateForm("humidity", e.target.value)}
                placeholder="如 45"
              />
            </label>
            <label>
              <span>压差（Pa）</span>
              <input
                type="number"
                step="0.1"
                value={form.pressure}
                onChange={(e) => updateForm("pressure", e.target.value)}
                placeholder="如 12"
              />
            </label>
            <div className="form-footer">
              <p className="limit-hint">
                判定规则：≤ {fmt(currentLimit)} 为正常；≥ {fmt(Math.round(currentLimit * WATCH_RATIO))} 为关注；&gt;{" "}
                {fmt(currentLimit)} 为异常（{form.cls}）
              </p>
              {formError && <p className="form-error">{formError}</p>}
              <button type="submit" className="primary-action">
                提交并由系统判定
              </button>
            </div>
          </form>
        </section>
      </section>

      <section className="records panel">
        <div className="section-heading">
          <div>
            <p>巡检台账</p>
            <h2>记录列表（{visibleRecords.length} 条）</h2>
          </div>
        </div>
        <div className="record-list">
          {visibleRecords.length === 0 && <p className="empty">当前筛选条件下暂无记录</p>}
          {visibleRecords.map((record) => (
            <article key={record.id} className="record-card">
              <div className="record-head">
                <div>
                  <h3>
                    {record.room} <em>{record.cls}</em>
                  </h3>
                  <p>
                    0.5μm 粒子 {fmt(record.particles)} / 上限 {fmt(CLASS_LIMITS[record.cls])} 个/m³ · {record.temperature}℃ ·{" "}
                    {record.humidity}%RH · 压差 {record.pressure}Pa
                  </p>
                  <p className="record-meta">
                    登记：{record.createdBy} · {record.createdAt}　更新：{record.updatedAt}
                  </p>
                  {record.note && <p className="record-note">处理说明：{record.note}</p>}
                </div>
                <div className="badge-group">
                  <span className={levelClass[record.level]}>{record.level}</span>
                  <span className={statusClass[record.status]}>{record.status}</span>
                </div>
              </div>

              {record.status !== "已关闭" && (
                <div className="record-actions">
                  {record.status === "待处理" && (
                    <button className="primary-action" disabled={!isEngineer} onClick={() => startHandling(record.id)}>
                      推进到处理中
                    </button>
                  )}
                  {record.status === "处理中" && (
                    <>
                      <input
                        className="note-input"
                        value={noteDrafts[record.id] ?? ""}
                        onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [record.id]: e.target.value }))}
                        placeholder="填写处理说明（必填，未填将保留待处理）"
                        disabled={!isEngineer}
                      />
                      <button className="primary-action" disabled={!isEngineer} onClick={() => closeRecord(record.id)}>
                        填写说明并关闭
                      </button>
                    </>
                  )}
                  {!isEngineer && <span className="role-hint">处置操作需切换到厂务工程师</span>}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

export default App;
