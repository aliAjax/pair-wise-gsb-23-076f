import { useEffect, useMemo, useState, type ReactNode } from "react";
import "./styles.css";

/* ============================== 领域配置 ============================== */

type Grade = "ISO 5" | "ISO 6" | "ISO 7" | "黄光区";
type Level = "正常" | "关注" | "异常";
type Stage = "待处理" | "处理中" | "已关闭";
type Role = "巡检员" | "厂务工程师" | "班组长";

const ROLES: Role[] = ["巡检员", "厂务工程师", "班组长"];
const GRADES: Grade[] = ["ISO 5", "ISO 6", "ISO 7", "黄光区"];
const LEVELS: Level[] = ["正常", "关注", "异常"];
const STAGES: Stage[] = ["待处理", "处理中", "已关闭"];

// ISO 14644-1：≥0.5μm 悬浮粒子上限（粒/m³）；黄光区按 ISO 7 管控
const PARTICLE_LIMIT: Record<Grade, number> = {
  "ISO 5": 3_520,
  "ISO 6": 35_200,
  "ISO 7": 352_000,
  黄光区: 352_000,
};

// 达到上限的 80% 进入关注，超过上限判异常
const WATCH_RATIO = 0.8;

interface InspectionRecord {
  id: string;
  room: string;
  grade: Grade;
  particle: number; // 0.5μm 粒子数，粒/m³
  temperature: number; // ℃
  humidity: number; // %RH
  pressure: number; // Pa
  level: Level; // 系统按等级阈值自动判定
  stage: Stage; // 处置进度
  createdBy: Role;
  createdAt: string;
  startedBy?: Role;
  startedAt?: string;
  closedBy?: Role;
  closedAt?: string;
  handleNote?: string;
}

/* ============================== 判定逻辑 ============================== */

function judgeLevel(grade: Grade, particle: number): Level {
  const limit = PARTICLE_LIMIT[grade];
  if (particle > limit) return "异常";
  if (particle > limit * WATCH_RATIO) return "关注";
  return "正常";
}

function ratioPercent(grade: Grade, particle: number): number {
  return Math.min(100, Math.round((particle / PARTICLE_LIMIT[grade]) * 100));
}

function formatTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ============================== 持久化 ============================== */

const RECORDS_KEY = "hxwl09.cleanroom.records.v1";
const ROLE_KEY = "hxwl09.cleanroom.role.v1";

function seedRecords(): InspectionRecord[] {
  const now = Date.now();
  const hour = 3_600_000;
  const make = (
    partial: Omit<InspectionRecord, "id" | "createdBy" | "createdAt"> &
      Partial<Pick<InspectionRecord, "createdBy" | "createdAt">>,
    offset: number
  ): InspectionRecord => ({
    id: `seed-${offset}`,
    createdBy: "巡检员",
    createdAt: new Date(now - offset).toISOString(),
    ...partial,
  });

  return [
    make(
      {
        room: "CR-1201",
        grade: "ISO 5",
        particle: 4_100,
        temperature: 22.1,
        humidity: 46,
        pressure: 12,
        level: judgeLevel("ISO 5", 4_100),
        stage: "待处理",
      },
      5 * hour
    ),
    make(
      {
        room: "CR-1408",
        grade: "ISO 5",
        particle: 3_300,
        temperature: 22.4,
        humidity: 48,
        pressure: 13,
        level: judgeLevel("ISO 5", 3_300),
        stage: "处理中",
        startedBy: "厂务工程师",
        startedAt: new Date(now - 1 * hour).toISOString(),
      },
      3 * hour
    ),
    make(
      {
        room: "Y-0302",
        grade: "黄光区",
        particle: 298_000,
        temperature: 22.8,
        humidity: 52,
        pressure: 11,
        level: judgeLevel("黄光区", 298_000),
        stage: "待处理",
      },
      26 * hour
    ),
    make(
      {
        room: "CR-3302",
        grade: "ISO 7",
        particle: 361_000,
        temperature: 23.5,
        humidity: 55,
        pressure: 9,
        level: judgeLevel("ISO 7", 361_000),
        stage: "已关闭",
        startedBy: "厂务工程师",
        startedAt: new Date(now - 20 * hour).toISOString(),
        closedBy: "厂务工程师",
        closedAt: new Date(now - 18 * hour).toISOString(),
        handleNote: "更换回风高效过滤器并复测，粒子数回落至 18 万，恢复生产。",
      },
      30 * hour
    ),
    make(
      {
        room: "CR-2107",
        grade: "ISO 6",
        particle: 19_800,
        temperature: 22.0,
        humidity: 45,
        pressure: 15,
        level: judgeLevel("ISO 6", 19_800),
        stage: "已关闭",
        closedBy: "厂务工程师",
        closedAt: new Date(now - 10 * hour).toISOString(),
      },
      28 * hour
    ),
  ];
}

function loadRecords(): InspectionRecord[] {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as InspectionRecord[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // 数据损坏时回落到示例台账
  }
  return seedRecords();
}

function loadRole(): Role {
  const saved = localStorage.getItem(ROLE_KEY) as Role | null;
  return saved && ROLES.includes(saved) ? saved : "巡检员";
}

/* ============================== 小组件 ============================== */

const LEVEL_BADGE: Record<Level, string> = {
  正常: "badge level-ok",
  关注: "badge level-watch",
  异常: "badge level-danger",
};

const STAGE_BADGE: Record<Stage, string> = {
  待处理: "badge stage-pending",
  处理中: "badge stage-doing",
  已关闭: "badge stage-closed",
};

function MetricCard({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone: "danger" | "watch" | "pending" | "doing";
  hint: string;
  key?: string;
}) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{hint}</p>
      <i className={`metric-bar bar-${tone}`} />
    </article>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  key?: string;
}) {
  return (
    <button
      type="button"
      className={`filter-chip${active ? " active" : ""}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/* ============================== 录入表单 ============================== */

interface FormState {
  room: string;
  grade: Grade;
  particle: string;
  temperature: string;
  humidity: string;
  pressure: string;
}

const EMPTY_FORM: FormState = {
  room: "",
  grade: "ISO 5",
  particle: "",
  temperature: "",
  humidity: "",
  pressure: "",
};

function EntryForm({
  role,
  onAdd,
}: {
  role: Role;
  onAdd: (record: InspectionRecord) => void;
  key?: string;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const particleNum = Number(form.particle);
  const particleValid = form.particle.trim() !== "" && Number.isFinite(particleNum) && particleNum >= 0;
  const previewLevel = particleValid ? judgeLevel(form.grade, particleNum) : null;
  const limit = PARTICLE_LIMIT[form.grade];

  const set = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const submit = () => {
    const nextErrors: Partial<Record<keyof FormState, string>> = {};
    if (!form.room.trim()) nextErrors.room = "请填写房间编号";
    if (!particleValid) nextErrors.particle = "请填写不小于 0 的粒子数";
    const temp = Number(form.temperature);
    if (form.temperature.trim() === "" || !Number.isFinite(temp)) {
      nextErrors.temperature = "请填写温度";
    }
    const hum = Number(form.humidity);
    if (form.humidity.trim() === "" || !Number.isFinite(hum) || hum < 0 || hum > 100) {
      nextErrors.humidity = "湿度填写 0–100";
    }
    const dp = Number(form.pressure);
    if (form.pressure.trim() === "" || !Number.isFinite(dp)) {
      nextErrors.pressure = "请填写压差";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const level = judgeLevel(form.grade, particleNum);
    onAdd({
      id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      room: form.room.trim().toUpperCase(),
      grade: form.grade,
      particle: particleNum,
      temperature: temp,
      humidity: hum,
      pressure: dp,
      level,
      // 正常记录无需处置，直接留档关闭；关注/异常进入待处理
      stage: level === "正常" ? "已关闭" : "待处理",
      createdBy: role,
      createdAt: new Date().toISOString(),
      ...(level === "正常"
        ? { closedAt: new Date().toISOString() }
        : {}),
    });
    setForm(EMPTY_FORM);
    setErrors({});
  };

  const readOnly = role === "班组长";

  return (
    <div className={readOnly ? "entry-form readonly" : "entry-form"}>
      <div className="field-grid">
        <label className={errors.room ? "invalid" : ""}>
          <span>房间编号 *</span>
          <input
            value={form.room}
            placeholder="如 CR-1201"
            disabled={readOnly}
            onChange={(e) => set("room", e.target.value)}
          />
          {errors.room && <em>{errors.room}</em>}
        </label>

        <label>
          <span>洁净等级 *</span>
          <select
            value={form.grade}
            disabled={readOnly}
            onChange={(e) => set("grade", e.target.value)}
          >
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g}（0.5μm 上限 {PARTICLE_LIMIT[g].toLocaleString()} 粒/m³）
              </option>
            ))}
          </select>
        </label>

        <label className={errors.particle ? "invalid" : ""}>
          <span>0.5μm 粒子数（粒/m³）*</span>
          <input
            type="number"
            min={0}
            step={1}
            value={form.particle}
            placeholder={`${form.grade} 上限 ${limit.toLocaleString()}`}
            disabled={readOnly}
            onChange={(e) => set("particle", e.target.value)}
          />
          {errors.particle ? (
            <em>{errors.particle}</em>
          ) : particleValid ? (
            <em className={`hint ${LEVEL_BADGE[previewLevel!]}`}>
              占上限 {ratioPercent(form.grade, particleNum)}%，系统判定：
              {previewLevel}
            </em>
          ) : (
            <em className="muted-hint">
              ≤{Math.round(limit * WATCH_RATIO).toLocaleString()} 正常 · ≤
              {limit.toLocaleString()} 关注 · 更高为异常
            </em>
          )}
        </label>

        <div className="field-row">
          <label className={errors.temperature ? "invalid" : ""}>
            <span>温度（℃）*</span>
            <input
              type="number"
              step="0.1"
              value={form.temperature}
              placeholder="22.0"
              disabled={readOnly}
              onChange={(e) => set("temperature", e.target.value)}
            />
            {errors.temperature && <em>{errors.temperature}</em>}
          </label>
          <label className={errors.humidity ? "invalid" : ""}>
            <span>湿度（%RH）*</span>
            <input
              type="number"
              step="1"
              value={form.humidity}
              placeholder="45"
              disabled={readOnly}
              onChange={(e) => set("humidity", e.target.value)}
            />
            {errors.humidity && <em>{errors.humidity}</em>}
          </label>
        </div>

        <label className={errors.pressure ? "invalid" : ""}>
          <span>压差（Pa）*</span>
          <input
            type="number"
            step="1"
            value={form.pressure}
            placeholder="如 12"
            disabled={readOnly}
            onChange={(e) => set("pressure", e.target.value)}
          />
          {errors.pressure && <em>{errors.pressure}</em>}
        </label>
      </div>

      <div className="form-actions">
        <button
          type="button"
          className="primary-action"
          onClick={submit}
          disabled={readOnly}
          title={readOnly ? "班组长只有查看权限" : "保存巡检记录"}
        >
          保存巡检记录
        </button>
        {readOnly && (
          <span className="role-note">当前为班组长（只读），切换到巡检员可新增记录</span>
        )}
      </div>
    </div>
  );
}

/* ============================== 记录卡片 ============================== */

function RecordCard({
  record,
  role,
  closeError,
  onAdvance,
  onClose,
  onClearError,
}: {
  record: InspectionRecord;
  role: Role;
  closeError: string | null;
  onAdvance: (id: string) => void;
  onClose: (id: string, note: string) => void;
  onClearError: (id: string) => void;
  key?: string;
}) {
  const [note, setNote] = useState("");
  const isEngineer = role === "厂务工程师";
  const pct = ratioPercent(record.grade, record.particle);
  const actionable = record.stage !== "已关闭" && record.level !== "正常";

  const attemptClose = () => {
    if (!note.trim()) {
      // 没写处理说明：不关闭，保留当前进度，由父级展示提示
      onClose(record.id, note);
      return;
    }
    onClose(record.id, note.trim());
    setNote("");
  };

  return (
    <article className={`record-card level-accent-${record.level === "正常" ? "ok" : record.level === "关注" ? "watch" : "danger"}`}>
      <div className="record-main">
        <div className="record-head">
          <h3>{record.room}</h3>
          <span className="badge grade-badge">{record.grade}</span>
          <span className={LEVEL_BADGE[record.level]}>{record.level}</span>
          <span className={STAGE_BADGE[record.stage]}>{record.stage}</span>
        </div>

        <div className="readings">
          <span>
            <b>0.5μm 粒子</b>
            {record.particle.toLocaleString()} 粒/m³
          </span>
          <span>
            <b>温度</b>
            {record.temperature.toFixed(1)} ℃
          </span>
          <span>
            <b>湿度</b>
            {record.humidity} %RH
          </span>
          <span>
            <b>压差</b>
            {record.pressure} Pa
          </span>
        </div>

        <div className="limit-bar" title={`占 ${record.grade} 粒子上限的 ${pct}%`}>
          <i className={`fill-${record.level === "正常" ? "ok" : record.level === "关注" ? "watch" : "danger"}`} style={{ width: `${pct}%` }} />
          <span>
            {pct}% · 上限 {PARTICLE_LIMIT[record.grade].toLocaleString()} 粒/m³
          </span>
        </div>

        <ul className="timeline">
          <li>
            <b>登记</b> {formatTime(record.createdAt)} · {record.createdBy}
          </li>
          {record.startedAt && (
            <li>
              <b>推进处理</b> {formatTime(record.startedAt)} · {record.startedBy}
            </li>
          )}
          {record.closedAt && (
            <li>
              <b>{record.level === "正常" ? "系统关闭" : "关闭"}</b>{" "}
              {formatTime(record.closedAt)}
              {record.closedBy ? ` · ${record.closedBy}` : ""}
            </li>
          )}
        </ul>

        {record.handleNote && (
          <div className="handle-note">
            <b>处理说明</b>
            <p>{record.handleNote}</p>
          </div>
        )}
      </div>

      <div className="record-side">
        {record.stage === "待处理" && actionable && (
          <>
            {isEngineer ? (
              <button
                type="button"
                className="primary-action"
                onClick={() => onAdvance(record.id)}
              >
                推进到处理中
              </button>
            ) : (
              <p className="side-hint">
                切换到<span className="role-tag">厂务工程师</span>
                后可推进到处理中
              </p>
            )}
          </>
        )}

        {record.stage === "处理中" && (
          <div className="close-box">
            <label>
              <span>处理说明 *</span>
              <textarea
                value={note}
                rows={3}
                disabled={!isEngineer}
                placeholder={
                  isEngineer ? "填写原因与处置措施后才能关闭" : "等待厂务工程师填写处理说明"
                }
                onChange={(e) => {
                  setNote(e.target.value);
                  if (closeError) onClearError(record.id);
                }}
              />
            </label>
            {isEngineer ? (
              <>
                <button type="button" className="danger-action" onClick={attemptClose}>
                  关闭记录
                </button>
                {closeError && <em className="form-error">{closeError}</em>}
              </>
            ) : (
              <p className="side-hint">仅厂务工程师可填写说明并关闭</p>
            )}
          </div>
        )}

        {record.stage === "已关闭" && (
          <span className="closed-stamp">已闭环</span>
        )}
      </div>
    </article>
  );
}

/* ============================== 主应用 ============================== */

function App() {
  const [records, setRecords] = useState<InspectionRecord[]>(loadRecords);
  const [role, setRole] = useState<Role>(loadRole);
  const [keyword, setKeyword] = useState("");
  const [gradeFilter, setGradeFilter] = useState<Grade | "全部">("全部");
  const [levelFilter, setLevelFilter] = useState<Level | "全部">("全部");
  const [stageFilter, setStageFilter] = useState<Stage | "全部">("全部");
  const [closeErrors, setCloseErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  }, [records]);

  useEffect(() => {
    localStorage.setItem(ROLE_KEY, role);
  }, [role]);

  const counts = useMemo(
    () => ({
      danger: records.filter((r) => r.level === "异常").length,
      watch: records.filter((r) => r.level === "关注").length,
      pending: records.filter((r) => r.stage === "待处理").length,
      doing: records.filter((r) => r.stage === "处理中").length,
    }),
    [records]
  );

  const countOf = (predicate: (r: InspectionRecord) => boolean) =>
    records.filter(predicate).length;

  const visibleRecords = useMemo(() => {
    const kw = keyword.trim().toUpperCase();
    return records.filter((r) => {
      if (kw && !r.room.includes(kw)) return false;
      if (gradeFilter !== "全部" && r.grade !== gradeFilter) return false;
      if (levelFilter !== "全部" && r.level !== levelFilter) return false;
      if (stageFilter !== "全部" && r.stage !== stageFilter) return false;
      return true;
    });
  }, [records, keyword, gradeFilter, levelFilter, stageFilter]);

  const addRecord = (record: InspectionRecord) => {
    setRecords((prev) => [record, ...prev]);
  };

  const advance = (id: string) => {
    if (role !== "厂务工程师") return;
    setRecords((prev) =>
      prev.map((r) =>
        r.id === id && r.stage === "待处理"
          ? {
              ...r,
              stage: "处理中",
              startedBy: role,
              startedAt: new Date().toISOString(),
            }
          : r
      )
    );
  };

  const close = (id: string, note: string) => {
    if (role !== "厂务工程师") return;
    if (!note.trim()) {
      // 关闭前必须填写处理说明，没写就保留待处理/处理中进度
      setCloseErrors((prev) => ({ ...prev, [id]: "请先填写处理说明，未填写时记录保留当前进度" }));
      return;
    }
    setRecords((prev) =>
      prev.map((r) =>
        r.id === id && r.stage !== "已关闭"
          ? {
              ...r,
              stage: "已关闭",
              handleNote: note,
              closedBy: role,
              closedAt: new Date().toISOString(),
              ...(r.stage === "待处理"
                ? { startedBy: role, startedAt: new Date().toISOString() }
                : {}),
            }
          : r
      )
    );
    setCloseErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-09 · 半导体洁净室巡检台账</p>
          <h1>洁净室巡检</h1>
          <p className="subtitle">
            按洁净等级的 0.5μm 粒子上限自动判定正常 / 关注 / 异常；异常与关注记录经
            厂务工程师推进、填写处理说明后闭环，数据保存在本机浏览器。
          </p>
        </div>
        <div className="stack-card">
          <span>当前角色（点击切换）</span>
          <div className="role-switch" role="tablist">
            {ROLES.map((r) => (
              <button
                key={r}
                type="button"
                className={role === r ? "active" : ""}
                onClick={() => setRole(r)}
              >
                {r}
              </button>
            ))}
          </div>
          <strong className="role-permission">
            {role === "巡检员" && "可新增巡检记录，不能处置工单"}
            {role === "厂务工程师" && "可推进待处理、填写说明并关闭"}
            {role === "班组长" && "只读：查看台账与处置进度"}
          </strong>
        </div>
      </section>

      <section className="metrics-grid">
        <MetricCard label="粒子异常" value={counts.danger} tone="danger" hint="超过等级粒子上限" />
        <MetricCard label="粒子关注" value={counts.watch} tone="watch" hint="达到上限 80%–100%" />
        <MetricCard label="待处理" value={counts.pending} tone="pending" hint="等待厂务工程师接单" />
        <MetricCard label="处理中" value={counts.doing} tone="doing" hint="已推进，待说明关闭" />
      </section>

      <section className="workspace">
        <aside className="panel narrow">
          <h2>筛选</h2>
          <label className="search-box">
            <span>房间编号</span>
            <input
              value={keyword}
              placeholder="搜索房间，如 CR-12"
              onChange={(e) => setKeyword(e.target.value)}
            />
          </label>

          <h3>洁净等级</h3>
          <div className="chips">
            <FilterChip
              active={gradeFilter === "全部"}
              onClick={() => setGradeFilter("全部")}
            >
              全部（{records.length}）
            </FilterChip>
            {GRADES.map((g) => (
              <FilterChip key={g} active={gradeFilter === g} onClick={() => setGradeFilter(g)}>
                {g}（{countOf((r) => r.grade === g)}）
              </FilterChip>
            ))}
          </div>

          <h3>系统判定</h3>
          <div className="chips">
            <FilterChip
              active={levelFilter === "全部"}
              onClick={() => setLevelFilter("全部")}
            >
              全部
            </FilterChip>
            {LEVELS.map((lv) => (
              <FilterChip key={lv} active={levelFilter === lv} onClick={() => setLevelFilter(lv)}>
                {lv}（{countOf((r) => r.level === lv)}）
              </FilterChip>
            ))}
          </div>

          <h3>处置进度</h3>
          <div className="chips">
            <FilterChip
              active={stageFilter === "全部"}
              onClick={() => setStageFilter("全部")}
            >
              全部
            </FilterChip>
            {STAGES.map((st) => (
              <FilterChip key={st} active={stageFilter === st} onClick={() => setStageFilter(st)}>
                {st}（{countOf((r) => r.stage === st)}）
              </FilterChip>
            ))}
          </div>

          <h3>等级判定规则（0.5μm，粒/m³）</h3>
          <ul className="rule-list">
            {GRADES.map((g) => (
              <li key={g}>
                <b>{g}</b>
                <span>
                  正常 ≤{Math.round(PARTICLE_LIMIT[g] * WATCH_RATIO).toLocaleString()} · 关注 ≤
                  {PARTICLE_LIMIT[g].toLocaleString()} · 更高异常
                </span>
              </li>
            ))}
          </ul>
        </aside>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p>巡检录入</p>
              <h2>新增记录</h2>
            </div>
          </div>
          <EntryForm role={role} onAdd={addRecord} />
        </section>
      </section>

      <section className="records panel">
        <div className="section-heading">
          <div>
            <p>巡检台账</p>
            <h2>
              记录列表
              <span className="list-count">
                显示 {visibleRecords.length} / {records.length} 条
              </span>
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              setKeyword("");
              setGradeFilter("全部");
              setLevelFilter("全部");
              setStageFilter("全部");
            }}
          >
            清空筛选
          </button>
        </div>
        <div className="record-list">
          {visibleRecords.length === 0 && (
            <p className="empty-state">没有符合筛选条件的巡检记录</p>
          )}
          {visibleRecords.map((record) => (
            <RecordCard
              key={record.id}
              record={record}
              role={role}
              closeError={closeErrors[record.id] ?? null}
              onAdvance={advance}
              onClose={close}
              onClearError={(id) =>
                setCloseErrors((prev) => {
                  const next = { ...prev };
                  delete next[id];
                  return next;
                })
              }
            />
          ))}
        </div>
      </section>
    </main>
  );
}

export default App;
