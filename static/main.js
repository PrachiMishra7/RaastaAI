document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);
  const els = {
    speed: $("speed-val"), ttc: $("ttc-val"), vehicles: $("v-count"), pedestrians: $("p-count"),
    cyclists: $("c-count"), trucks: $("t-count"), buses: $("b-count"), lights: $("l-count"),
    total: $("total-count"), gauge: $("gauge-text"), riskLabel: $("risk-label"), riskCopy: $("risk-copy"),
    panel: $("risk-panel-bg"), overlay: $("critical-overlay"), laneStatus: $("lane-status"),
    laneConf: $("lane-conf"), badge: $("chart-badge"), threatList: $("threat-list"), strip: $("warning-strip"),
    warningTitle: $("warning-title"), warningCopy: $("warning-copy"), action: $("action-val"), clock: $("clock-val"),
    date: $("date-val"), duration: $("duration-val"), processed: $("processed-val"), fps: $("fps-val")
  };

  const canvas = $("risk-chart");
  const ctx = canvas ? canvas.getContext("2d") : null;
  const riskHistory = [];
  const started = Date.now();

  // ---- NAVIGATION ----
  const navButtons = document.querySelectorAll(".rail-nav button[data-view]");
  const viewSections = document.querySelectorAll(".view-section");
  let alertLog = [];
  let totalFrames = 0;
  let totalAlerts = 0;
  let maxRiskScore = 0;
  let driftEvents = 0;

  function switchView(viewName) {
    navButtons.forEach(btn => btn.classList.remove("active"));
    const activeBtn = document.querySelector('.rail-nav button[data-view="' + viewName + '"]');
    if (activeBtn) activeBtn.classList.add("active");
    viewSections.forEach(section => section.classList.remove("active"));
    const target = $("view-" + viewName);
    if (target) target.classList.add("active");
  }

  navButtons.forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      switchView(btn.getAttribute("data-view"));
    });
  });

  // ---- END SESSION ----
  const endBtn = $("end-session-btn");
  if (endBtn) {
    endBtn.addEventListener("click", (e) => {
      e.preventDefault();
      document.querySelectorAll("img[src*='video_feed']").forEach(img => { img.src = ""; img.alt = "Session Ended"; });
      endBtn.textContent = "Ended";
      endBtn.style.background = "rgba(255,63,63,0.2)";
      endBtn.disabled = true;
    });
  }

  // ---- CLEAR ALERTS ----
  const clearBtn = $("clear-alerts-btn");
  if (clearBtn) {
    clearBtn.addEventListener("click", (e) => {
      e.preventDefault();
      alertLog = [];
      totalAlerts = 0;
      const al = $("alert-list");
      if (al) al.innerHTML = '<div class="alert-empty">No alerts recorded. Alerts appear here during analysis.</div>';
    });
  }

  // ---- UTILS ----
  function pad(num) { return String(num).padStart(2, "0"); }
  function fmtDuration(ms) {
    const s = Math.floor(ms / 1000);
    return pad(Math.floor(s / 3600)) + ":" + pad(Math.floor((s % 3600) / 60)) + ":" + pad(s % 60);
  }
  function setText(el, value) { if (el) el.textContent = value; }
  function count(value) { return String(value || 0).padStart(2, "0"); }

  function updateClock() {
    const now = new Date();
    setText(els.clock, now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    setText(els.date, now.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" }));
    const elapsed = Date.now() - started;
    setText(els.duration, fmtDuration(elapsed));
    const processedEl = $("processed-val");
    if (processedEl) processedEl.textContent = fmtDuration(elapsed);
    const sessionDuration = $("session-duration");
    if (sessionDuration) sessionDuration.textContent = fmtDuration(elapsed);
    const su = $("stat-uptime");
    if (su) su.textContent = fmtDuration(elapsed);
    const resEl = $("res-val");
    if (resEl && resEl.textContent === "—") resEl.textContent = "Live feed";
    const fpsEl = $("fps-val");
    if (fpsEl && fpsEl.textContent === "—") fpsEl.textContent = "0.0";
  }

  // ---- CHART ----
  function drawChart() {
    if (!ctx || !canvas) return;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(120,150,190,.16)";
    if (!riskHistory.length) {
      ctx.fillStyle = "rgba(140,160,180,.7)";
      ctx.font = "12px Inter";
      ctx.fillText("Waiting for live risk data", 42, h / 2);
      return;
    }
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = 18 + i * ((h - 36) / 4);
      ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(w - 18, y); ctx.stroke();
    }
    for (let i = 0; i <= 4; i++) {
      const x = 40 + i * ((w - 58) / 4);
      ctx.beginPath(); ctx.moveTo(x, 18); ctx.lineTo(x, h - 25); ctx.stroke();
    }
    const grad = ctx.createLinearGradient(0, 35, 0, h - 25);
    grad.addColorStop(0, "rgba(255,60,40,.7)"); grad.addColorStop(.48, "rgba(255,170,0,.42)"); grad.addColorStop(1, "rgba(0,230,95,.1)");
    const line = ctx.createLinearGradient(40, 0, w - 18, 0);
    line.addColorStop(0, "#19ff66"); line.addColorStop(.55, "#ffd21f"); line.addColorStop(1, "#ff3f3f");
    const pts = riskHistory.map((v, i) => [40 + i * ((w - 58) / (riskHistory.length - 1)), h - 25 - (Math.min(100, v) / 100) * (h - 45)]);
    ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.lineTo(w - 18, h - 25); ctx.lineTo(40, h - 25); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
    ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.strokeStyle = line; ctx.lineWidth = 3; ctx.stroke();
    const lp = pts[pts.length - 1]; ctx.fillStyle = "#ff3f3f"; ctx.beginPath(); ctx.arc(lp[0], lp[1], 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#8fa2ba"; ctx.font = "12px Inter";
    ctx.fillText("100", 8, 22); ctx.fillText("75", 16, 58); ctx.fillText("50", 16, 94); ctx.fillText("25", 16, 130);
    ctx.fillText("0", 24, h - 24); ctx.fillText("RISK (%)", 10, 100); ctx.fillText("TIME (s)", w / 2 - 26, h - 5); ctx.fillText("NOW", w - 42, h - 8);
  }

  // ---- RISK STATE ----
  function setRiskState(risk, status) {
    const critical = status === "CRITICAL" || risk >= 75;
    const caution = status === "CAUTION" || risk >= 40;
    if (els.overlay) els.overlay.classList.toggle("hidden", !critical);
    if (els.panel) els.panel.style.boxShadow = critical ? "0 0 34px rgba(255,63,63,.25)" : "";
    setText(els.riskLabel, critical ? "High Risk" : caution ? "Caution" : "Safe");
    setText(els.riskCopy, critical ? "High probability of collision. Take caution and maintain safe distance." : caution ? "Elevated risk detected. Keep distance and monitor lane position." : "Road corridor is stable. Continue monitoring surroundings.");
    setText(els.warningTitle, critical ? "Warning: Vehicle Ahead" : caution ? "Caution: Object Ahead" : "Monitoring");
    setText(els.warningCopy, critical ? "High collision risk detected. Maintain safe distance." : caution ? "Risk increasing. Prepare to slow down if needed." : "Awaiting live risk data.");
    setText(els.action, critical ? "Slow Down" : caution ? "Monitor" : "Stand by");
    if (els.strip) els.strip.style.borderColor = critical ? "rgba(255,63,63,.58)" : caution ? "rgba(255,210,31,.45)" : "rgba(105,226,60,.35)";

    // Risk analysis view
    var rbv = $("risk-big-val"); if (rbv) rbv.textContent = Math.round(risk);
    var rbl = $("risk-big-label");
    if (rbl) { rbl.textContent = critical ? "CRITICAL" : caution ? "CAUTION" : "SAFE"; rbl.style.color = critical ? "var(--red)" : caution ? "var(--yellow)" : "var(--green)"; }
    var rbd = $("risk-big-desc");
    if (rbd) rbd.textContent = critical ? "High probability of collision." : caution ? "Elevated risk. Monitor lane position." : "Road corridor is stable.";
    var rta = $("risk-ttc-action");
    if (rta) { rta.textContent = critical ? "BRAKE NOW" : caution ? "SLOW DOWN" : "CONTINUE"; rta.style.color = critical ? "var(--red)" : caution ? "var(--yellow)" : "var(--green)"; }
  }

  function updateThreats(risk, m) {
    if (!els.threatList) return;
    var items = [];
    if (m.vehicles) items.push(["CAR", "Vehicle Ahead", Math.max(risk, 45)]);
    if (m.pedestrians) items.push(["PED", "Pedestrian Ahead", Math.max(risk - 10, 20)]);
    if (m.cyclists) items.push(["BIKE", "Cyclist Nearby", Math.max(risk - 20, 15)]);
    if (m.trucks) items.push(["TRK", "Truck Ahead", Math.max(risk - 30, 10)]);
    if (!items.length) {
      els.threatList.innerHTML = '<li><span>—</span>Awaiting detection <b>—</b></li>';
      return;
    }
    els.threatList.innerHTML = items.slice(0, 4).map(function(t) { return '<li><span>' + t[0] + '</span>' + t[1] + '<b>' + Math.round(Math.min(99, t[2])) + '%</b></li>'; }).join("");
  }

  // ---- UPDATE OTHER VIEWS ----
  function updateSecondaryViews(m, risk, ttc) {
    setText($("det-vehicles"), count(m.vehicles));
    setText($("det-pedestrians"), count(m.pedestrians));
    setText($("det-cyclists"), count(m.cyclists));
    setText($("det-trucks"), count(m.trucks));
    setText($("det-buses"), count(m.buses));
    setText($("det-signs"), count(m.traffic_lights));
    var dt = (m.vehicles||0)+(m.pedestrians||0)+(m.cyclists||0)+(m.trucks||0)+(m.buses||0)+(m.traffic_lights||0);
    setText($("det-total"), dt);

    setText($("lane-metric-status"), (m.lane_status || "Stable").toUpperCase());
    setText($("lane-metric-conf"), (m.lane_confidence || "High").toUpperCase());
    var lms = $("lane-metric-status");
    if (lms) lms.style.color = m.lane_status === "Stable" ? "var(--green)" : "var(--yellow)";
    if (m.lane_status && m.lane_status !== "Stable") { driftEvents++; setText($("lane-drift-count"), driftEvents); }

    var rtbv = $("risk-ttc-big-val"); if (rtbv) rtbv.textContent = ttc.toFixed(1);

    var rfl = $("risk-factor-list");
    if (rfl) {
      var factors = [];
      if (risk >= 40) factors.push('<li><i style="background:var(--red)"></i><span>Object in driving corridor</span><b style="color:var(--orange)">High Impact</b></li>');
      if (risk >= 60) factors.push('<li><i style="background:var(--red)"></i><span>Large object in frame</span><b style="color:var(--orange)">High Impact</b></li>');
      if (risk >= 75) factors.push('<li><i style="background:var(--orange)"></i><span>Near to vehicle</span><b style="color:var(--yellow)">Medium Impact</b></li>');
      if (risk >= 50) factors.push('<li><i style="background:var(--red)"></i><span>Approaching trajectory</span><b style="color:var(--orange)">High Impact</b></li>');
      if (m.lane_status === "Stable") factors.push('<li><i style="background:var(--green)"></i><span>Centered in lane</span><b style="color:var(--green)">Low Impact</b></li>');
      if (factors.length === 0) factors.push('<li><i style="background:var(--green)"></i><span>No active risk factors</span><b style="color:var(--green)">Safe</b></li>');
      rfl.innerHTML = factors.join("");
    }

    totalFrames++;
    setText($("stat-frames"), totalFrames);
    if (risk > maxRiskScore) maxRiskScore = risk;
    setText($("stat-max-risk"), Math.round(maxRiskScore) + "%");

    var cpu = 35 + Math.round(Math.random() * 10);
    var ram = 60 + Math.round(Math.random() * 5);
    var gpu = 19 + Math.round(Math.random() * 4);
    var pc = $("perf-cpu"); var pcv = $("perf-cpu-val");
    var pr = $("perf-ram"); var prv = $("perf-ram-val");
    var pg = $("perf-gpu"); var pgv = $("perf-gpu-val");
    if (pc) pc.style.width = Math.min(100, dt) + "%"; if (pcv) pcv.textContent = dt;
    if (pr) pr.style.width = Math.min(100, risk) + "%"; if (prv) prv.textContent = Math.round(risk) + "%";
    if (pg) pg.style.width = Math.min(100, totalAlerts * 10) + "%"; if (pgv) pgv.textContent = totalAlerts;
  }

  // ---- ALERTS ----
  function addAlert(alert) {
    alertLog.unshift(alert);
    if (alertLog.length > 30) alertLog.pop();
    totalAlerts++;
    setText($("stat-alerts"), totalAlerts);
    var al = $("alert-list");
    if (!al) return;
    var lc = { CRITICAL: "var(--red)", WARNING: "var(--orange)", CAUTION: "var(--yellow)" };
    al.innerHTML = alertLog.map(function(a) {
      var c = lc[a.level] || "var(--green)";
      return '<div class="alert-item" style="border-left-color:' + c + '"><span class="alert-level" style="color:' + c + '">' + a.level + '</span><span class="alert-time">' + a.time + '</span><span class="alert-msg">' + a.message + '</span></div>';
    }).join("");
  }

  // ---- TELEMETRY FETCH ----
  async function fetchTelemetry() {
    try {
      var response = await fetch("/telemetry");
      if (!response.ok) return;
      var data = await response.json();
      var m = data.metrics || {};
      var risk = Number(m.risk_score || 0);
      var ttcVal = Number(data.ttc || 5.0);
      riskHistory.push(risk); riskHistory.shift();

      setText(els.speed, data.speed || 0); setText(els.ttc, ttcVal.toFixed(1));
      setText(els.vehicles, String(m.vehicles || 0)); setText(els.pedestrians, String(m.pedestrians || 0)); setText(els.cyclists, String(m.cyclists || 0));
      setText(els.trucks, String(m.trucks || 0)); setText(els.buses, String(m.buses || 0)); setText(els.lights, String(m.traffic_lights || 0));
      setText(els.total, (m.vehicles||0)+(m.pedestrians||0)+(m.cyclists||0)+(m.trucks||0)+(m.buses||0)+(m.traffic_lights||0));
      setText(els.gauge, Math.round(risk)); setText(els.badge, Math.round(risk) + "%");
      setText(els.laneStatus, (m.lane_status || "Stable").toUpperCase()); setText(els.laneConf, m.lane_confidence || "—");
      
      // Update dynamic radial rings
      var riskColor = risk >= 75 ? "#ff3f3f" : risk >= 40 ? "#ffd21f" : "#20d4ff";
      var gaugeArc = document.getElementById("risk-gauge-arc");
      if (gaugeArc) {
        gaugeArc.style.setProperty("--risk-pct", risk + "%");
        gaugeArc.style.setProperty("--risk-deg", (risk * 1.8) + "deg");
        gaugeArc.style.setProperty("--risk-color", riskColor);
      }
      
      // Update Risk Level Bar dynamically
      ['rl-safe', 'rl-caution', 'rl-warning', 'rl-critical'].forEach(id => {
        var el = document.getElementById(id);
        if (el) el.className = '';
      });
      if (risk >= 75) {
        var el = document.getElementById('rl-critical');
        if (el) el.className = 'active-critical';
      } else if (risk >= 50) {
        var el = document.getElementById('rl-warning');
        if (el) el.className = 'active-warning';
      } else if (risk >= 25) {
        var el = document.getElementById('rl-caution');
        if (el) el.className = 'active-caution';
      } else {
        var el = document.getElementById('rl-safe');
        if (el) el.className = 'active-safe';
      }

      var speedRing = document.getElementById("speed-ring");
      if (speedRing) {
        // Assume max speed is around 120 km/h for the gauge fill
        var speedPct = Math.min(100, ((data.speed || 0) / 120) * 100);
        speedRing.style.setProperty("--speed-pct", speedPct + "%");
      }

      const fpsEl = $("fps-val"); if (fpsEl) fpsEl.textContent = (data.speed ? (data.speed / 2.4).toFixed(1) : "0.0");
      const resEl = $("res-val"); if (resEl) resEl.textContent = "Live feed";
      setRiskState(risk, m.risk_status); updateThreats(risk, m); drawChart();
      updateSecondaryViews(m, risk, ttcVal);

      if (data.alerts && data.alerts.length > 0) {
        for (var i = data.alerts.length - 1; i >= 0; i--) {
          var a = data.alerts[i];
          var exists = alertLog.some(function(x) { return x.time === a.time && x.message === a.message; });
          if (!exists) addAlert(a);
        }
      }
    } catch (err) { console.error("Telemetry fetch error:", err); }
  }

  updateClock(); drawChart(); fetchTelemetry();
  setInterval(updateClock, 1000);
  setInterval(fetchTelemetry, 250);
});
