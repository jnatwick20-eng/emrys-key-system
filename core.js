
(function(){
  const APP_NAME = "Emry's Key System";
  const VERSION = "v2-lite";

  const $ = (sel, root=document) => root.querySelector(sel);
  const el = (tag, attrs={}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs||{})) {
      if (k === "class") n.className = v;
      else if (k === "style") n.setAttribute("style", v);
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const kid of kids) {
      if (kid == null) continue;
      if (typeof kid === "string") n.appendChild(document.createTextNode(kid));
      else n.appendChild(kid);
    }
    return n;
  };

  const css = `
  :root{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;}
  body{margin:0;background:#f6f7f9;}
  .eks-wrap{max-width:1200px;margin:0 auto;padding:12px;}
  .eks-card{background:#fff;border:1px solid #e3e6ea;border-radius:14px;padding:14px;box-shadow:0 2px 10px rgba(0,0,0,.04);margin-bottom:12px;}
  .eks-title{display:flex;align-items:baseline;gap:10px;margin:0 0 8px;}
  .eks-title h1{margin:0;font-size:18px;}
  .eks-pill{display:inline-block;padding:2px 8px;border-radius:999px;background:#eef1f4;font-size:12px;font-weight:800;}
  .eks-muted{color:#666;font-size:12px;line-height:1.35}
  .eks-row{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}
  .eks-field{flex:1 1 180px}
  .eks-field.sm{flex:0 0 150px}
  .eks-label{display:block;font-size:12px;color:#444;margin-bottom:4px}
  .eks-in, .eks-sel{width:100%;padding:10px;border:1px solid #d7dbe0;border-radius:10px;font-size:14px;box-sizing:border-box;background:#fff}
  .eks-btnbar{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px}
  .eks-btn{border:1px solid #d7dbe0;background:#111;color:#fff;padding:10px 12px;border-radius:12px;cursor:pointer;font-weight:800;font-size:14px}
  .eks-btn.sec{background:#fff;color:#111}
  .eks-btn:disabled{opacity:.5;cursor:not-allowed}
  .eks-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
  .eks-tab{border:1px solid #d7dbe0;background:#fff;color:#111;padding:8px 10px;border-radius:12px;font-weight:800;cursor:pointer}
  .eks-tab.active{background:#111;color:#fff;border-color:#111}
  .eks-scroll{overflow:auto;max-height:60vh;border:1px solid #eef1f4;border-radius:12px}
  table{width:100%;border-collapse:collapse}
  th,td{border-bottom:1px solid #eef1f4;padding:8px 6px;text-align:left;vertical-align:top;font-size:13px}
  th{font-size:12px;color:#555}
  .eks-ok{color:#067647;font-weight:900}
  .eks-warn{color:#b42318;font-weight:900}
  .mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;}
  .eks-tree{display:flex;gap:8px;flex-wrap:wrap}
  .eks-tree button{padding:6px 10px;border-radius:999px}
  `;
  const st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  const parseBitting = (str, pinCount) => {
    const digits = String(str||"").replace(/[^0-9]/g,"");
    if (digits.length !== pinCount) return null;
    return digits.split("").map(d=>Number(d));
  };
  const fmt = (arr) => arr.join("");
  const depthSet = (range) => (range==="1-9") ? [1,2,3,4,5,6,7,8,9] : [0,1,2,3,4,5,6,7,8,9];
  const macsOk = (b, macs) => {
    for (let i=0;i<b.length-1;i++){
      if (Math.abs(b[i]-b[i+1])>macs) return false;
    }
    return true;
  };
  const parityOk = (b) => {
    for (let i=0;i<b.length-1;i++){
      if ((b[i]%2)===(b[i+1]%2)) return false;
    }
    return true;
  };
  const pinStacksForKeys = (keys) => {
    const pc = keys[0].length;
    const stacks = [];
    for (let i=0;i<pc;i++){
      const vals = keys.map(k=>k[i]).slice().sort((a,b)=>a-b);
      const uniq = [...new Set(vals)];
      const bottom = uniq[0];
      const masters = [];
      for (let j=1;j<uniq.length;j++) masters.push(uniq[j]-uniq[j-1]);
      stacks.push([bottom, ...masters]);
    }
    return stacks;
  };
  const stacksToStr = (stacks) => stacks.map(s=>s.join("+")).join(" | ");

  const toCsv = (rows) => rows.map(r => r.map(cell=>{
    const s = (cell ?? "").toString();
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
    return s;
  }).join(",")).join("\n");

  const download = (text, filename, mime="text/csv") => {
    const blob = new Blob([text], {type:mime});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 600);
  };

  const addReject = (rej, reason, example) => {
    if (!rej.has(reason)) rej.set(reason, {count:0, examples:[]});
    const r = rej.get(reason);
    r.count++;
    if (example && r.examples.length < 5) r.examples.push(example);
  };

  const state = {
    filter: { level:"TMK", mkSym:null },
    tmk:null, mks:[], cks:[], doors:[], pinning:[], pinsNeeded:[],
    rejects:new Map()
  };

  function fieldText(label, id, value="", mono=false){
    return el("div", {class:"eks-field"},
      el("label", {class:"eks-label", for:id}, label),
      el("input", {class:`eks-in${mono?" mono":""}`, id, value})
    );
  }
  function fieldNum(label, id, value, min, max){
    return el("div", {class:"eks-field sm"},
      el("label", {class:"eks-label", for:id}, label),
      el("input", {class:"eks-in", id, type:"number", value:String(value), min:String(min), max:String(max)})
    );
  }
  function fieldSelect(label, id, options, value){
    const sel = el("select", {class:"eks-sel", id});
    options.forEach(opt=> sel.appendChild(el("option", {value:opt}, opt)));
    sel.value = value;
    return el("div", {class:"eks-field sm"},
      el("label", {class:"eks-label", for:id}, label),
      sel
    );
  }

  function fillSelect(id, labels, defaultIndex){
    const sel = $("#"+id);
    sel.innerHTML="";
    labels.forEach((lab,i)=> sel.appendChild(el("option",{value:String(i)}, lab)));
    sel.value = String(Math.min(defaultIndex, labels.length-1));
  }

  function showTab(key){
    document.querySelectorAll(".eks-tab").forEach(b=>{
      b.classList.toggle("active", b.getAttribute("data-tab")===key);
    });
    ["tree","keys","pinning","pins","doors","rejects"].forEach(t=>{
      const p = $("#tab-"+t);
      if (p) p.style.display = (t===key) ? "" : "none";
    });
  }

  function buildUI(root){
    root.innerHTML="";
    const header = el("div",{class:"eks-card"},
      el("div",{class:"eks-title"},
        el("h1",{}, APP_NAME),
        el("span",{class:"eks-pill"}, VERSION)
      ),
      el("div",{class:"eks-muted"}, "Hold & Vary first • Smart generation • Tree filter • Reject report • Export CSV")
    );

    const controls = el("div",{class:"eks-card"},
      el("h2",{style:"margin:0 0 10px;font-size:14px"},"Settings"),
      el("div",{class:"eks-row"},
        fieldText("Project name","projName","Prairie Heights (name later ok)"),
        fieldText("Keyway label","keyway","Schlage / SC1 / SC4"),
        fieldSelect("Pins","pinCount",["5","6"],"6"),
        fieldSelect("Depth","depthRange",["0-9","1-9"],"0-9"),
        fieldNum("MACS","macs",7,0,9),
        fieldSelect("Step","step",["2","1"],"2"),
        fieldNum("Doors","doorCount",200,1,5000),
      ),
      el("div",{class:"eks-row",style:"margin-top:8px"},
        el("div",{class:"eks-field"},
          el("label",{class:"eks-label"},"TMK bitting"),
          el("input",{class:"eks-in mono", id:"tmk", value:"410566"})
        ),
        fieldNum("MK count","mkCount",10,1,200),
        fieldNum("CK per MK","ckPerMk",20,1,500),
      ),
      el("div",{class:"eks-row",style:"margin-top:8px"},
        el("div",{class:"eks-field sm"},
          el("label",{class:"eks-label"},"MK vary chamber"),
          el("select",{class:"eks-sel", id:"mkVary"})
        ),
        el("div",{class:"eks-field sm"},
          el("label",{class:"eks-label"},"CK vary A"),
          el("select",{class:"eks-sel", id:"ckVaryA"})
        ),
        el("div",{class:"eks-field sm"},
          el("label",{class:"eks-label"},"CK vary B"),
          el("select",{class:"eks-sel", id:"ckVaryB"})
        ),
        fieldSelect("Parity","parity",["on","off"],"on"),
        fieldSelect("Hide bittings","hideBittings",["off","on"],"off"),
      ),
      el("div",{class:"eks-btnbar"},
        el("button",{class:"eks-btn", id:"btnGenerate"},"Generate"),
        el("button",{class:"eks-btn sec", id:"btnExport", disabled:"true"},"Export CSV"),
        el("button",{class:"eks-btn sec", id:"btnPrint"},"Print"),
      ),
      el("div",{id:"status", class:"eks-muted", style:"margin-top:8px"},"Ready.")
    );

    const tabs = el("div",{class:"eks-tabs"},
      el("button",{class:"eks-tab active", "data-tab":"tree", onclick:()=>showTab("tree")},"Tree"),
      el("button",{class:"eks-tab", "data-tab":"keys", onclick:()=>showTab("keys")},"Keys"),
      el("button",{class:"eks-tab", "data-tab":"pinning", onclick:()=>showTab("pinning")},"Pinning"),
      el("button",{class:"eks-tab", "data-tab":"pins", onclick:()=>showTab("pins")},"Pins Needed"),
      el("button",{class:"eks-tab", "data-tab":"doors", onclick:()=>showTab("doors")},"Doors"),
      el("button",{class:"eks-tab", "data-tab":"rejects", onclick:()=>showTab("rejects")},"Rejects"),
    );

    const summary = el("div",{class:"eks-card"}, el("div",{id:"summary", class:"eks-muted"},"No project generated yet."));

    const treePanel = el("div",{id:"tab-tree"},
      el("div",{class:"eks-card"},
        el("h2",{style:"margin:0 0 8px;font-size:14px"},"Hierarchy"),
        el("div",{class:"eks-muted", style:"margin-bottom:10px"},"Click TMK / MK to filter outputs."),
        el("div",{class:"eks-tree", id:"treeButtons"}),
        el("div",{id:"treeInfo", class:"eks-muted", style:"margin-top:10px"})
      )
    );

    const tableCard = (id, title, headCells, bodyId, preNote=null) => el("div",{id:`tab-${id}`, style:"display:none"},
      el("div",{class:"eks-card"},
        el("h2",{style:"margin:0 0 8px;font-size:14px"}, title),
        preNote ? el("div",{class:"eks-muted", style:"margin-bottom:8px"}, preNote) : null,
        el("div",{class:"eks-scroll"},
          el("table",{},
            el("thead",{}, el("tr",{}, ...headCells.map(c=>el("th",{},c)) )),
            el("tbody",{id:bodyId})
          )
        )
      )
    );

    const keysPanel = tableCard("keys","Key list",["Type","Symbol","Bitting","Notes"],"keysBody");
    const pinPanel  = tableCard("pinning","Pinning chart",["Door","CK","MK","CK bitting","Stacks"],"pinBody","Stacks per chamber: bottom + master + master…");
    const pinsPanel = tableCard("pins","Pins needed",["Type","Size","Count"],"pinsBody","Counts are depth increments (bottom/master).");
    const doorsPanel= tableCard("doors","Door schedule",["Door","CK","MK","Door name"],"doorsBody","Edit door names; symbols stay fixed.");
    const rejPanel  = tableCard("rejects","Reject report",["Reason","Count","Examples"],"rejBody","Why keys were rejected (MACS/parity/target fill).");

    const wrap = el("div",{class:"eks-wrap"}, header, controls, tabs, summary, treePanel, keysPanel, pinPanel, pinsPanel, doorsPanel, rejPanel);
    root.appendChild(wrap);

    const refreshChambers = ()=>{
      const pc = Number($("#pinCount").value);
      const labels = Array.from({length:pc},(_,i)=>`#${i+1}`);
      fillSelect("mkVary", labels, 1);
      fillSelect("ckVaryA", labels, Math.max(0, pc-2));
      fillSelect("ckVaryB", labels, Math.max(0, pc-1));
    };
    $("#pinCount").addEventListener("change", refreshChambers);
    refreshChambers();

    $("#btnGenerate").addEventListener("click", onGenerate);
    $("#btnExport").addEventListener("click", onExport);
    $("#btnPrint").addEventListener("click", ()=>window.print());
    $("#hideBittings").addEventListener("change", ()=>renderAll());
  }

  function shouldShow(mkSym){
    if (state.filter.level==="TMK") return true;
    return state.filter.mkSym === mkSym;
  }
  function maybeHide(str){
    return ($("#hideBittings").value==="on") ? "••••••" : str;
  }

  function onGenerate(){
    state.rejects = new Map();
    state.filter = {level:"TMK", mkSym:null};
    state.mks=[]; state.cks=[]; state.doors=[]; state.pinning=[]; state.pinsNeeded=[];
    $("#btnExport").disabled = true;

    const pc = Number($("#pinCount").value);
    const range = $("#depthRange").value;
    const macs = Number($("#macs").value);
    const step = Number($("#step").value);
    const doorCount = Number($("#doorCount").value);
    const mkCount = Number($("#mkCount").value);
    const ckPerMk = Number($("#ckPerMk").value);
    const parityOn = $("#parity").value === "on";

    const tmk = parseBitting($("#tmk").value, pc);
    if (!tmk){
      $("#status").innerHTML = `<span class="eks-warn">TMK must be exactly ${pc} digits.</span>`;
      renderAll();
      return;
    }
    state.tmk = tmk;
    if (parityOn && !parityOk(tmk)) addReject(state.rejects, "TMK parity warning", fmt(tmk));

    const ds = depthSet(range);
    const mkVaryUser = Number($("#mkVary").value);
    const ckAUser = Number($("#ckVaryA").value);
    const ckBUser = Number($("#ckVaryB").value);

    const mkVaryCandidates = [...new Set([mkVaryUser,0,1,2,3,4,5].filter(v=>v<pc))];
    const ckPairs = [
      [ckAUser, ckBUser],
      [pc-2, pc-1],
      [pc-3, pc-1],
      [0, pc-1],
      [1, pc-1],
    ].map(([a,b])=> a===b ? [a,(b+1)%pc] : [a,b]);

    const modes = [
      {name:"evens/odds", A:ds.filter(v=>v%2===0), B:ds.filter(v=>v%2===1)},
      {name:"odds/evens", A:ds.filter(v=>v%2===1), B:ds.filter(v=>v%2===0)},
      {name:"all/all", A:ds.slice(), B:ds.slice()},
    ];

    const stepAlign = (arr)=> step===1 ? arr : arr.filter(v=> (v%step)===0);

    let best=null;
    for (const mv of mkVaryCandidates){
      for (const [aIdx,bIdx] of ckPairs){
        for (const mode of modes){
          const attempt = tryBuild({tmk, ds, macs, step, parityOn, mv, aIdx, bIdx, mkCount, ckPerMk, doorCount, Avals:stepAlign(mode.A), Bvals:stepAlign(mode.B)});
          if (attempt.ok){ best = {...attempt, mv, aIdx, bIdx, modeName:mode.name}; break; }
          addReject(state.rejects, attempt.reason, attempt.example);
        }
        if (best) break;
      }
      if (best) break;
    }

    if (!best){
      $("#status").innerHTML = `<span class="eks-warn">Could not generate ${doorCount} doors.</span> Check Rejects tab.`;
      renderAll();
      return;
    }

    state.mks = best.mks;
    state.cks = best.cks;
    state.doors = best.doors;
    state.pinning = best.pinning;
    state.pinsNeeded = best.pinsNeeded;

    $("#status").innerHTML = `<span class="eks-ok">Generated.</span> ${mkCount} MK • ${doorCount} doors • MK vary #${best.mv+1} • CK vary #${best.aIdx+1}/#${best.bIdx+1} • ${best.modeName}`;
    $("#btnExport").disabled = false;
    renderAll();
  }

  function tryBuild({tmk, ds, macs, step, parityOn, mv, aIdx, bIdx, mkCount, ckPerMk, doorCount, Avals, Bvals}){
    const mks=[]; const used=new Set();
    const cand = ds.filter(v=> step===1 || (v%step)===0);

    for (const v of cand){
      if (mks.length>=mkCount) break;
      if (v===tmk[mv]) continue;
      const mk=tmk.slice(); mk[mv]=v;
      if (!macsOk(mk, macs)) continue;
      if (parityOn && !parityOk(mk)) continue;
      const s=fmt(mk);
      if (used.has(s)) continue;
      used.add(s);
      mks.push({sym:`MK${mks.length+1}`, bitting:mk});
    }
    if (mks.length<mkCount){
      return {ok:false, reason:"Not enough MKs", example:`mv#${mv+1} macs=${macs} step=${step} parity=${parityOn}`};
    }

    const cks=[]; const doors=[]; const pinning=[];
    let doorNum=1;

    for (const mk of mks){
      let made=0;
      for (const a of Avals){
        for (const b of Bvals){
          if (made>=ckPerMk) break;
          if (doorNum>doorCount) break;

          const ck=mk.bitting.slice(); ck[aIdx]=a; ck[bIdx]=b;
          const ckStr=fmt(ck);
          if (ckStr===fmt(mk.bitting) || ckStr===fmt(tmk)) continue;
          if (!macsOk(ck, macs)) continue;
          if (parityOn && !parityOk(ck)) continue;

          const sym=`C${String(doorNum).padStart(3,"0")}`;
          cks.push({doorNum, sym, mkSym:mk.sym, bitting:ck});
          doors.push({doorNum, ckSym:sym, mkSym:mk.sym, name:""});
          const stacks = pinStacksForKeys([ck, mk.bitting, tmk]);
          pinning.push({doorNum, ckSym:sym, mkSym:mk.sym, ckBittingStr:ckStr, stacksStr:stacksToStr(stacks), stacks});
          made++; doorNum++;
        }
        if (made>=ckPerMk || doorNum>doorCount) break;
      }
      if (made<ckPerMk && doorNum<=doorCount){
        return {ok:false, reason:"Could not fill CKs per MK", example:`${mk.sym} made=${made}/${ckPerMk}`};
      }
      if (doorNum>doorCount) break;
    }

    if (cks.length!==doorCount){
      return {ok:false, reason:"Did not reach door target", example:`got=${cks.length} want=${doorCount}`};
    }

    const counts=new Map();
    for (const p of pinning){
      for (const chamber of p.stacks){
        const bottom=chamber[0];
        counts.set(`bottom:${bottom}`,(counts.get(`bottom:${bottom}`)||0)+1);
        for (let i=1;i<chamber.length;i++){
          const mp=chamber[i];
          counts.set(`master:${mp}`,(counts.get(`master:${mp}`)||0)+1);
        }
      }
    }
    const pinsNeeded=[...counts.entries()].map(([k,v])=>{
      const [type,size]=k.split(":");
      return {type, size:Number(size), count:v};
    }).sort((a,b)=>a.type.localeCompare(b.type)||a.size-b.size);

    return {ok:true, mks, cks, doors, pinning, pinsNeeded};
  }

  function renderAll(){
    const sum = $("#summary");
    if (!state.tmk){
      sum.textContent = "No project generated yet.";
    } else {
      sum.innerHTML = `<span class="eks-pill">TMK</span> <span class="mono">${maybeHide(fmt(state.tmk))}</span>
        &nbsp; <span class="eks-pill">MK</span> ${state.mks.length}
        &nbsp; <span class="eks-pill">Doors</span> ${state.cks.length}
        &nbsp; <span class="eks-pill">Filter</span> ${state.filter.level}${state.filter.mkSym?(" "+state.filter.mkSym):""}`;
    }

    const tree = $("#treeButtons");
    const info = $("#treeInfo");
    if (tree){
      tree.innerHTML="";
      if (!state.tmk){ info.textContent=""; }
      else{
        const mkBtn = (label, active, fn) => el("button",{class:`eks-btn ${active?"":"sec"}`, style:"padding:6px 10px;font-size:12px", onclick:fn}, label);
        tree.appendChild(mkBtn("TMK (All)", state.filter.level==="TMK", ()=>{state.filter={level:"TMK", mkSym:null}; renderAll();}));
        state.mks.forEach(mk=>{
          tree.appendChild(mkBtn(mk.sym, state.filter.mkSym===mk.sym, ()=>{state.filter={level:"MK", mkSym:mk.sym}; renderAll();}));
        });
        info.innerHTML = `Currently: <span class="eks-pill">${state.filter.level}${state.filter.mkSym?(" "+state.filter.mkSym):""}</span>`;
      }
    }

    const kb = $("#keysBody");
    if (kb){
      kb.innerHTML="";
      if (state.tmk){
        kb.appendChild(el("tr",{}, el("td",{},"TMK"), el("td",{},"TMK"), el("td",{class:"mono"}, maybeHide(fmt(state.tmk))), el("td",{},"")));
        state.mks.forEach(mk=>{
          if (!shouldShow(mk.sym)) return;
          kb.appendChild(el("tr",{}, el("td",{},"MK"), el("td",{},mk.sym), el("td",{class:"mono"}, maybeHide(fmt(mk.bitting))), el("td",{},"")));
          state.cks.filter(c=>c.mkSym===mk.sym).forEach(ck=>{
            kb.appendChild(el("tr",{}, el("td",{},"CK"), el("td",{},ck.sym), el("td",{class:"mono"}, maybeHide(fmt(ck.bitting))), el("td",{class:"eks-muted"},`under ${ck.mkSym}`)));
          });
        });
      }
    }

    const pb = $("#pinBody");
    if (pb){
      pb.innerHTML="";
      state.pinning.forEach(p=>{
        if (!shouldShow(p.mkSym)) return;
        pb.appendChild(el("tr",{}, el("td",{},String(p.doorNum)), el("td",{},p.ckSym), el("td",{},p.mkSym),
          el("td",{class:"mono"}, maybeHide(p.ckBittingStr)), el("td",{class:"mono"}, p.stacksStr)));
      });
    }

    const pinsB = $("#pinsBody");
    if (pinsB){
      pinsB.innerHTML="";
      state.pinsNeeded.forEach(r=>{
        pinsB.appendChild(el("tr",{}, el("td",{},r.type), el("td",{class:"mono"},String(r.size)), el("td",{},String(r.count))));
      });
    }

    const db = $("#doorsBody");
    if (db){
      db.innerHTML="";
      state.doors.forEach(d=>{
        if (!shouldShow(d.mkSym)) return;
        const inp = el("input",{class:"eks-in", value:d.name||"", placeholder:"name later", oninput:(e)=>{d.name = e.target.value;}});
        db.appendChild(el("tr",{}, el("td",{},String(d.doorNum)), el("td",{},d.ckSym), el("td",{},d.mkSym), el("td",{},inp)));
      });
    }

    const rb = $("#rejBody");
    if (rb){
      rb.innerHTML="";
      if (!state.rejects || state.rejects.size===0){
        rb.appendChild(el("tr",{}, el("td",{class:"eks-muted"},"No rejects logged"), el("td",{},""), el("td",{},"")));
      } else {
        [...state.rejects.entries()].map(([reason,obj])=>({reason, ...obj}))
          .sort((a,b)=>b.count-a.count)
          .forEach(it=>{
            rb.appendChild(el("tr",{}, el("td",{},it.reason), el("td",{},String(it.count)), el("td",{class:"mono"},(it.examples||[]).join(" ; "))));
          });
      }
    }
  }

  function onExport(){
    if (!state.tmk) return;
    const header = [
      ["App", APP_NAME],
      ["Version", VERSION],
      ["TMK", fmt(state.tmk)],
      ["Pins", $("#pinCount").value],
      ["MACS", $("#macs").value],
      ["Step", $("#step").value],
      []
    ];
    const keysRows = [
      ...header,
      ["Type","Symbol","Bitting","Notes"],
      ["TMK","TMK",fmt(state.tmk),"Top master"],
      ...state.mks.map(mk=>["MK",mk.sym,fmt(mk.bitting),""]),
      ...state.cks.map(ck=>["CK",ck.sym,fmt(ck.bitting),`Under ${ck.mkSym}`]),
    ];
    const pinRows = [
      ...header,
      ["Door","CK","MK","CK bitting","Stacks"],
      ...state.pinning.map(p=>[p.doorNum,p.ckSym,p.mkSym,p.ckBittingStr,p.stacksStr]),
    ];
    const doorRows = [
      ...header,
      ["Door","CK","MK","Door name"],
      ...state.doors.map(d=>[d.doorNum,d.ckSym,d.mkSym,d.name||""]),
    ];
    download(toCsv(keysRows), "keys.csv");
    download(toCsv(pinRows), "pinning.csv");
    download(toCsv(doorRows), "doors.csv");
  }

  function mount(){
    const root = document.getElementById("app") || document.body;
    buildUI(root);
    renderAll();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
