/* =========================================================================
   출장 정산 보고서 - 기능(자바스크립트)
   구역 안내:
     [공통]      숫자 포맷·저장 헬퍼
     [차량설정]  제조사/모델/년식/연비/감가상각 (localStorage 저장)
     [증빙]      사진 업로드/삭제
     [계산]      연료비·합계 계산
     [보고서]    미리보기 렌더링
     [연료비수정] 자동계산값 직접 수정 + 확인
     [PDF]       인쇄로 PDF 저장
     [PWA]       서비스워커 등록
   ========================================================================= */

/* ===== [공통] ===== */
const DEFAULT_EFF = 8.7;            // 기본 연비 km/L
const DEFAULT_DEPREC = 10;          // 기본 감가상각 반영율 (%)
let fuelOverride = null;            // 연료비를 직접 수정하면 그 값, 아니면 null(자동계산 사용)

const won = n => (Math.round(n)||0).toLocaleString("ko-KR") + " 원";
const num = id => parseFloat(document.getElementById(id).value) || 0;
const save = (k,v)=>{ if(v !== "") localStorage.setItem(k, v); };

/* ===== [차량설정] ===== */
// 제조사별 대표 모델 (국내 + 수입 주요 20개사)
const MAKERS = {
  "현대": ["그랜저","쏘나타","아반떼","투싼","싼타페","팰리세이드","코나","스타리아"],
  "기아": ["K5","K8","쏘렌토","스포티지","카니발","셀토스","모닝","K3"],
  "제네시스": ["G80","G70","G90","GV70","GV80"],
  "쉐보레": ["트레일블레이저","트랙스","말리부","스파크"],
  "르노코리아": ["QM6","SM6","XM3"],
  "KG모빌리티": ["토레스","렉스턴","티볼리"],
  "도요타": ["캠리","코롤라","라브4","프리우스"],
  "혼다": ["파일럿","CR-V","어코드","시빅","HR-V"],
  "닛산": ["알티마","로그","엑스트레일"],
  "폭스바겐": ["티구안","골프","파사트","아테온"],
  "BMW": ["3시리즈","5시리즈","X3","X5"],
  "메르세데스-벤츠": ["E클래스","C클래스","GLC","S클래스"],
  "아우디": ["A6","A4","Q5","Q7"],
  "볼보": ["XC60","S60","XC90","XC40"],
  "포드": ["익스플로러","머스탱","레인저"],
  "테슬라": ["모델3","모델Y","모델S"],
  "렉서스": ["ES","RX","NX"],
  "푸조": ["3008","5008","2008"],
  "MINI": ["쿠퍼","컨트리맨"],
  "지프": ["랭글러","체로키","컴패스"],
  "기타": [],
};
const CUSTOM_MODEL = "기타(직접입력)";
const CUSTOM_YEAR  = "직접입력";

const makerSel    = document.getElementById("maker");
const modelSel    = document.getElementById("model");
const modelCustom = document.getElementById("modelCustom");
const yearSel     = document.getElementById("year");
const yearCustom  = document.getElementById("yearCustom");

// 드롭다운 채우기: 제조사
const addOption = (sel, val)=>{ const o=document.createElement("option"); o.value=o.textContent=val; sel.appendChild(o); };
Object.keys(MAKERS).forEach(m=> addOption(makerSel, m));
// 드롭다운 채우기: 년식(올해~1995) + 직접입력
const thisYear = new Date().getFullYear();
for(let y = thisYear; y >= 1995; y--) addOption(yearSel, String(y));
addOption(yearSel, CUSTOM_YEAR);

function fillModels(maker){
  modelSel.innerHTML = "";
  (MAKERS[maker] || []).concat(CUSTOM_MODEL).forEach(m=> addOption(modelSel, m));
}
// '직접입력' 칸들의 표시/숨김 처리
function updateCustom(){
  modelSel.style.display    = (makerSel.value === "기타") ? "none" : "block";
  modelCustom.style.display = (makerSel.value === "기타" || modelSel.value === CUSTOM_MODEL) ? "block" : "none";
  yearCustom.style.display  = (yearSel.value === CUSTOM_YEAR) ? "block" : "none";
}
// 현재 설정으로 차량명 문자열 만들기 (예: "2018년식 혼다 파일럿")
function getCarName(){
  let model = modelSel.value;
  if(makerSel.value === "기타" || model === CUSTOM_MODEL) model = modelCustom.value.trim();
  const maker = (makerSel.value === "기타") ? "" : makerSel.value;
  let year = yearSel.value;
  if(year === CUSTOM_YEAR) year = yearCustom.value.trim();
  return [year ? year+"년식" : "", maker, model].filter(Boolean).join(" ") || "차량 미설정";
}

// 저장값 복원 (없으면 사용자의 기존 차량을 기본값으로)
makerSel.value = localStorage.getItem("tripReport_maker") || "혼다";
fillModels(makerSel.value);
modelSel.value = localStorage.getItem("tripReport_model") || "파일럿";
if(!modelSel.value) modelSel.selectedIndex = 0;
modelCustom.value = localStorage.getItem("tripReport_modelCustom") || "";
const savedYear = localStorage.getItem("tripReport_year") || "2018";
if([...yearSel.options].some(o => o.value === savedYear)) {
  yearSel.value = savedYear;                       // 목록에 있는 년도면 그대로 선택
} else {
  yearSel.value = CUSTOM_YEAR; yearCustom.value = savedYear;  // 없으면 직접입력으로
}
document.getElementById("eff").value        = localStorage.getItem("tripReport_eff")    || DEFAULT_EFF;
document.getElementById("deprecRate").value = localStorage.getItem("tripReport_deprec") || DEFAULT_DEPREC;
updateCustom();

// 변경 시 저장 + 화면 갱신 (input들은 아래 [공통 리스너]가 render 처리)
makerSel.addEventListener("change", ()=>{
  save("tripReport_maker", makerSel.value);
  if(makerSel.value !== "기타"){ fillModels(makerSel.value); modelSel.selectedIndex = 0; save("tripReport_model", modelSel.value); }
  updateCustom(); render();
});
modelSel.addEventListener("change", ()=>{ save("tripReport_model", modelSel.value); updateCustom(); render(); });
modelCustom.addEventListener("input", ()=> save("tripReport_modelCustom", modelCustom.value));
yearSel.addEventListener("change", ()=>{
  if(yearSel.value !== CUSTOM_YEAR) save("tripReport_year", yearSel.value);
  updateCustom(); render();
});
yearCustom.addEventListener("input", ()=> save("tripReport_year", yearCustom.value));
document.getElementById("eff").addEventListener("input",        e=> save("tripReport_eff", e.target.value));
document.getElementById("deprecRate").addEventListener("input", e=> save("tripReport_deprec", e.target.value));

/* ===== [출장지] ===== */
// 지역별 주요 도시 (목록에 없으면 '직접입력')
const DESTINATIONS = {
  "특별·광역시": ["서울","부산","대구","인천","광주","대전","울산","세종"],
  "경기": ["수원","성남","용인","고양","부천","안산","화성","평택","파주","의정부"],
  "강원": ["춘천","원주","강릉","속초"],
  "충청": ["청주","충주","천안","아산","당진"],
  "전라": ["전주","군산","익산","여수","순천","목포"],
  "경상": ["포항","구미","경주","안동","창원","김해","진주","양산","거제"],
  "제주": ["제주","서귀포"],
};
const CUSTOM_DEST = "직접입력";
const destSel    = document.getElementById("dest");
const destCustom = document.getElementById("destCustom");

// 드롭다운 채우기 (지역별 그룹 + 직접입력)
destSel.innerHTML = '<option value="">출장지 선택</option>';
for(const [region, cities] of Object.entries(DESTINATIONS)){
  const g = document.createElement("optgroup"); g.label = region;
  cities.forEach(city=> addOption(g, city));
  destSel.appendChild(g);
}
addOption(destSel, CUSTOM_DEST);

function getDest(){
  if(destSel.value === CUSTOM_DEST) return destCustom.value.trim() || "-";
  return destSel.value || "-";
}
function updateDestCustom(){
  destCustom.style.display = (destSel.value === CUSTOM_DEST) ? "block" : "none";
}
destSel.addEventListener("change", ()=>{ updateDestCustom(); render(); });
updateDestCustom();

/* ===== [증빙] ===== */
const EVIDENCE = [
  { key:"map",     label:"출장지까지 거리 지도" },
  { key:"opinet",  label:"오피넷 평균 유가 캡처" },
  { key:"carspec", label:"차량 제원(연비) 이미지" },
  { key:"lodging", label:"숙박비 영수증" },
  { key:"transit", label:"대중교통 영수증" },
  { key:"toll",    label:"톨게이트 영수증" },
];
const images = {};  // key -> dataURL

// 업로드 슬롯 생성 (썸네일·삭제버튼은 label 밖에 둬야 클릭이 겹치지 않음)
const upWrap = document.getElementById("uploads");
EVIDENCE.forEach(ev=>{
  const slot = document.createElement("div");
  slot.className = "upslot";
  slot.innerHTML = `
    <label class="upload" id="up-${ev.key}">📎 ${ev.label} 첨부
      <input type="file" accept="image/*" data-key="${ev.key}">
    </label>
    <div class="thumb" id="thumb-${ev.key}"></div>`;
  upWrap.appendChild(slot);
});

// 파일 선택 → 미리보기 + 삭제버튼 표시
document.querySelectorAll('.upload input').forEach(inp=>{
  inp.addEventListener("change", e=>{
    const file = e.target.files[0];
    if(!file) return;
    const key = e.target.dataset.key;
    const reader = new FileReader();
    reader.onload = ev=>{
      images[key] = ev.target.result;
      document.getElementById("up-"+key).classList.add("filled");
      document.getElementById("thumb-"+key).innerHTML =
        `<img src="${ev.target.result}"><button type="button" class="del" data-key="${key}">🗑 첨부 삭제</button>`;
      render();
    };
    reader.readAsDataURL(file);
  });
});

// 삭제 버튼 (이벤트 위임)
upWrap.addEventListener("click", e=>{
  const btn = e.target.closest(".del");
  if(!btn) return;
  const key = btn.dataset.key;
  delete images[key];
  document.getElementById("thumb-"+key).innerHTML = "";
  const lab = document.getElementById("up-"+key);
  lab.classList.remove("filled");
  lab.querySelector("input").value = "";   // 같은 파일을 다시 선택할 수 있게 초기화
  render();
});

/* ===== [계산] ===== */
function calc(){
  const eff = num("eff") || DEFAULT_EFF;           // 설정한 연비 (없으면 기본값)
  const deprecPct = (document.getElementById("deprecRate").value === "")
                      ? DEFAULT_DEPREC : num("deprecRate");   // 감가상각 반영율(%)
  const oneway = num("dist");
  const roundtrip = oneway * 2;
  const price = num("fuelPrice");
  const liters = roundtrip / eff;
  const fuelBase = liters * price;                 // 순수 연료 소모비
  const deprec = fuelBase * (deprecPct / 100);     // 감가상각 반영분
  const fuelCalc = fuelBase + deprec;              // 자동계산 연료비
  const fuelCost = (fuelOverride != null) ? fuelOverride : fuelCalc;  // 실제 적용 연료비
  const lodging = num("lodging"), toll = num("toll"), transit = num("transit");
  const total = fuelCost + lodging + toll + transit;
  return { eff, deprecPct, oneway, roundtrip, price, liters, fuelBase, deprec, fuelCalc, fuelCost, lodging, toll, transit, total };
}

// 출장 기간 텍스트 (n박 n+1일)
function periodText(){
  const s = document.getElementById("startDate").value;
  const e = document.getElementById("endDate").value;
  if(!s) return "-";
  if(!e || e === s) return `${s} (당일)`;
  const nights = Math.round((new Date(e) - new Date(s)) / 86400000);
  if(nights < 0) return `${s} ~ ${e}`;       // 종료일이 더 빠르면 그냥 범위만
  return `${s} ~ ${e} (${nights}박 ${nights+1}일)`;
}

/* ===== [보고서] ===== */
function render(){
  const c = calc();
  document.getElementById("grand").textContent = won(c.total);

  // 자동계산 연료비 안내 + (직접 수정 안 했으면) 입력칸을 자동값으로 채움
  document.getElementById("fuelAutoHint").textContent =
    `자동계산: ${won(c.fuelCalc)}  (소모비 ${won(c.fuelBase)} + 감가상각 ${c.deprecPct}% ${won(c.deprec)})`;
  const fuelField = document.getElementById("fuelCostInput");
  if(fuelOverride == null) fuelField.value = c.fuelCalc ? Math.round(c.fuelCalc) : "";

  const carName = getCarName();
  document.getElementById("carSub").textContent = `차량: ${carName} · 연비 ${c.eff} km/L`;

  const period = periodText();
  const dest = getDest();

  const evHtml = EVIDENCE.map(ev=>{
    const inner = images[ev.key]
      ? `<img src="${images[ev.key]}">`
      : `<div class="box">첨부 공간</div>`;
    return `<div class="ev"><div class="cap">${ev.label}</div>${inner}</div>`;
  }).join("");

  const adjustNote = (fuelOverride != null)
    ? ` <b>→ 직접 조정 ${won(c.fuelCost)}</b>` : "";

  document.getElementById("report").innerHTML = `
    <div class="doc-title">출 장 정 산 보 고 서</div>
    <table>
      <tr><th>출장기간</th><td>${period}</td></tr>
      <tr><th>출장지</th><td>${dest}</td></tr>
      <tr><th>출장거리</th><td>편도 ${c.oneway} km / 왕복 ${c.roundtrip} km</td></tr>
      <tr><th>소모 연료비</th><td class="num">${won(c.fuelCost)}</td></tr>
      <tr><td colspan="2" class="calc-row">↳ 왕복 ${c.roundtrip}km ÷ ${c.eff}km/L × ${won(c.price)} = ${won(c.fuelBase)} + 감가상각 ${c.deprecPct}% ${won(c.deprec)} = ${won(c.fuelCalc)}${adjustNote}<span class="carinfo"> · 차량 ${carName}(연비 ${c.eff}km/L)</span></td></tr>
      <tr><th>숙박비</th><td class="num">${won(c.lodging)}</td></tr>
      <tr><th>톨게이트 비용</th><td class="num">${won(c.toll)}</td></tr>
      <tr><th>대중교통 비용</th><td class="num">${won(c.transit)}</td></tr>
      <tr class="sum-row"><th>비용 합계</th><td class="num">${won(c.total)}</td></tr>
    </table>
    <h3>증빙 자료</h3>
    <div class="evidence">${evHtml}</div>
  `;
}

// [공통 리스너] 입력할 때마다 실시간 갱신 (연료비 입력칸은 따로 처리)
document.querySelectorAll("input:not(#fuelCostInput)").forEach(i=> i.addEventListener("input", render));

/* ===== [연료비수정] ===== */
const fuelField = document.getElementById("fuelCostInput");
fuelField.addEventListener("input", ()=>{
  fuelOverride = (fuelField.value === "") ? null : (parseFloat(fuelField.value) || 0);
  render();
});
// 자동계산값보다 크게 입력하면 확인을 받는다
fuelField.addEventListener("change", ()=>{
  if(fuelOverride == null) return;
  const auto = Math.round(calc().fuelCalc);
  if(auto > 0 && fuelOverride > auto){
    const ok = confirm(
      `입력한 연료비 ${won(fuelOverride)} 가 자동계산값 ${won(auto)} 보다 큽니다.\n` +
      `원칙적으로 자동계산 금액 이내로 입력해야 합니다.\n\n그래도 이 금액으로 진행하시겠습니까?`);
    if(!ok){
      fuelOverride = null;     // 취소 → 자동계산값으로 되돌림
      render();
    }
  }
});
// 자동계산값으로 되돌리기
document.getElementById("resetFuel").addEventListener("click", ()=>{
  fuelOverride = null;
  render();
});

render();

/* ===== [PDF] ===== */
// PDF 저장 = 브라우저 인쇄 기능 사용 (html2canvas 빈 페이지 문제 회피, 글자도 선명함)
document.getElementById("makePdf").addEventListener("click", ()=>{
  const d = getDest();
  const dest = (d && d !== "-") ? d : "출장";
  const start = document.getElementById("startDate").value || "";
  const origTitle = document.title;
  document.title = `출장정산보고서_${dest}_${start}`;   // 저장 시 기본 파일명에 반영
  window.print();
  setTimeout(()=>{ document.title = origTitle; }, 500);
});

/* ===== [PWA] ===== */
// 서비스워커 등록 (HTTPS/보안 컨텍스트에서만 동작 → 오프라인 + 앱 설치 가능)
if("serviceWorker" in navigator && window.isSecureContext){
  navigator.serviceWorker.register("sw.js").catch(()=>{});
}
