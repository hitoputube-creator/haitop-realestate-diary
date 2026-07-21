// analyze-listing-intake
//
// 업무일지 메모를 GPT로 구조화 추출하고, 주소가 있으면 국토교통부 건축HUB
// (법정동코드 검색 + 건축물대장 표제부)로 보강한 뒤 listing_intakes에
// status='pending'으로 저장한다. listings 테이블에는 절대 쓰지 않는다 —
// 사람이 register.html에서 확인 후 "등록"을 눌러야 최종 저장된다.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const BUILDING_REGISTER_API_KEY = Deno.env.get("BUILDING_REGISTER_API_KEY");

const CATEGORY_OPTIONS: Record<string, string[]> = {
  "공장창고": ["공장", "창고"],
  "상가사무실": ["상가", "사무실"],
  "토지": ["토지", "농지", "택지"],
  "주거용": ["아파트", "오피스텔", "단독주택", "전원주택", "상가주택", "다가구주택"],
  "건물빌딩": ["건물", "빌딩"],
};

const EXTRACT_SCHEMA_NOTE = `
반드시 아래 JSON 스키마로만 응답하세요 (마크다운, 설명 문구 없이 JSON 객체만):
{
  "category1": "공장창고" | "상가사무실" | "토지" | "주거용" | "건물빌딩" | null,
  "category2": string | null,  // category1에 따라 다음 중 하나 — 공장창고:[공장,창고] 상가사무실:[상가,사무실] 토지:[토지,농지,택지] 주거용:[아파트,오피스텔,단독주택,전원주택,상가주택,다가구주택] 건물빌딩:[건물,빌딩]
  "deal_type": "매매" | "전세" | "월세" | "임대" | null,
  "title": string | null,       // 20자 이내 짧은 매물 제목
  "address": string | null,     // 메모에서 찾은 가장 구체적인 주소(동/리 + 번지 포함, 예: "파주시 목동동 1134")
  "sale_price": string | null,  // 정확한 원(KRW) 금액을 쉼표·단위 없는 순수 숫자 문자열로만 반환. "3억 5천만원"이면 "350000000"
  "deposit": string | null,     // 위와 동일한 방식 (순수 숫자 문자열)
  "monthly_rent": string | null, // 위와 동일한 방식 (순수 숫자 문자열)
  "area_m2": number | null,     // 면적을 ㎡ 숫자로. 평만 있으면 3.3058을 곱해 환산
  "floor_info": string | null,
  "detail_description": string | null // 메모 내용을 다듬은 매물 설명 문단
}
메모에 명시되지 않은 값은 반드시 null로 반환하고, 절대 추측해서 지어내지 마세요.
`.trim();

interface ExtractedFields {
  category1: string | null;
  category2: string | null;
  deal_type: string | null;
  title: string | null;
  address: string | null;
  sale_price: string | null;
  deposit: string | null;
  monthly_rent: string | null;
  area_m2: number | null;
  floor_info: string | null;
  detail_description: string | null;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function extractWithOpenAI(memoText: string): Promise<ExtractedFields> {
  if (!OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY가 설정되지 않았습니다. Supabase 대시보드 > Edge Functions > Secrets에서 등록해주세요.",
    );
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "당신은 한국 부동산 중개사무소의 업무 메모에서 매물 등록 정보를 추출하는 어시스턴트입니다.\n" +
            EXTRACT_SCHEMA_NOTE,
        },
        { role: "user", content: memoText },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenAI 호출 실패 (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI 응답에서 추출 결과를 찾을 수 없습니다.");

  let parsed: Partial<ExtractedFields>;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("OpenAI가 유효한 JSON을 반환하지 않았습니다.");
  }

  return {
    category1: parsed.category1 ?? null,
    category2: parsed.category2 ?? null,
    deal_type: parsed.deal_type ?? null,
    title: parsed.title ?? null,
    address: parsed.address ?? null,
    sale_price: parsed.sale_price ?? null,
    deposit: parsed.deposit ?? null,
    monthly_rent: parsed.monthly_rent ?? null,
    area_m2: typeof parsed.area_m2 === "number" ? parsed.area_m2 : null,
    floor_info: parsed.floor_info ?? null,
    detail_description: parsed.detail_description ?? null,
  };
}

interface ParsedAddress {
  sigunguName: string;
  dongName: string;
  platGbCd: "0" | "1";
  bun: string;
  ji: string;
}

// 자유 텍스트 주소를 최대한 파싱한다 — 실패하면 null (건축물대장 조회는 건너뜀).
// 회사가 파주시 관내에서만 영업하므로 시/군/구가 없으면 "파주시"를 기본값으로 둔다.
function parseAddress(address: string): ParsedAddress | null {
  const sigunguMatch = address.match(/([가-힣]+시|[가-힣]+군|[가-힣]+구)/);
  const sigunguName = sigunguMatch ? sigunguMatch[1] : "파주시";

  const dongMatches = [...address.matchAll(/[가-힣0-9]+(?:읍|면|동|리)/g)];
  if (dongMatches.length === 0) return null;
  const dongName = dongMatches[dongMatches.length - 1][0];

  const afterDong = address.slice(address.lastIndexOf(dongName) + dongName.length);
  const isMountain = /^\s*산/.test(afterDong);
  const lotMatch = afterDong.match(/(\d+)(?:-(\d+))?/);
  if (!lotMatch) return null;

  return {
    sigunguName,
    dongName,
    platGbCd: isMountain ? "1" : "0",
    bun: lotMatch[1],
    ji: lotMatch[2] || "0",
  };
}

// 법정동코드 검색 (행정표준코드관리시스템, StanReginCd) → 5자리 시군구코드 + 5자리 법정동코드
async function lookupDongCode(sigunguName: string, dongName: string): Promise<{ sigunguCd: string; bjdongCd: string } | null> {
  if (!BUILDING_REGISTER_API_KEY) return null;

  const url = new URL("http://apis.data.go.kr/1741000/StanReginCd/getStanReginCdList");
  url.searchParams.set("serviceKey", BUILDING_REGISTER_API_KEY);
  url.searchParams.set("type", "json");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "20");
  url.searchParams.set("locatadd_nm", `${sigunguName} ${dongName}`);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`법정동코드 검색 실패 (${res.status})`);
  const data = await res.json();

  const rows = data?.StanReginCd?.[1]?.row ?? [];
  const match = rows.find((r: Record<string, unknown>) =>
    typeof r.locatadd_nm === "string" && r.locatadd_nm.includes(dongName) && !r.locatadd_nm.includes("산") // 산번지 특례 리스트 제외
  ) ?? rows[0];
  if (!match?.region_cd) return null;

  const code = String(match.region_cd);
  return { sigunguCd: code.slice(0, 5), bjdongCd: code.slice(5, 10) };
}

// 건축HUB 건축물대장정보 서비스 — 표제부(연면적/주용도/층수/구조/사용승인일)
async function lookupBuildingRegister(parsed: ParsedAddress) {
  if (!BUILDING_REGISTER_API_KEY) {
    throw new Error("BUILDING_REGISTER_API_KEY가 설정되지 않았습니다.");
  }
  const codes = await lookupDongCode(parsed.sigunguName, parsed.dongName);
  if (!codes) throw new Error(`"${parsed.sigunguName} ${parsed.dongName}"에 대한 법정동코드를 찾지 못했습니다.`);

  const url = new URL("http://apis.data.go.kr/1613000/BldRgstService_v2/getBrTitleInfo");
  url.searchParams.set("serviceKey", BUILDING_REGISTER_API_KEY);
  url.searchParams.set("_type", "json");
  url.searchParams.set("sigunguCd", codes.sigunguCd);
  url.searchParams.set("bjdongCd", codes.bjdongCd);
  url.searchParams.set("platGbCd", parsed.platGbCd);
  url.searchParams.set("bun", parsed.bun.padStart(4, "0"));
  url.searchParams.set("ji", parsed.ji.padStart(4, "0"));
  url.searchParams.set("numOfRows", "5");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`건축물대장 조회 실패 (${res.status})`);
  const data = await res.json();

  const header = data?.response?.header;
  if (header && header.resultCode && header.resultCode !== "00") {
    throw new Error(`건축물대장 조회 실패: ${header.resultMsg || header.resultCode}`);
  }

  const items = data?.response?.body?.items?.item;
  const item = Array.isArray(items) ? items[0] : items;
  return { raw: data, item: item ?? null };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "POST 요청만 지원합니다." }, 405);
  }

  let body: {
    diaryId?: string;
    title?: string;
    content?: string;
    customerName?: string;
    customerPhone?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "요청 본문이 유효한 JSON이 아닙니다." }, 400);
  }

  const { diaryId, title, content, customerName, customerPhone } = body;
  if (!content || !content.trim()) {
    return jsonResponse({ error: "분석할 메모 내용(content)이 없습니다." }, 400);
  }

  const memoText = [
    title ? `제목: ${title}` : null,
    customerName ? `이름: ${customerName}` : null,
    customerPhone ? `연락처: ${customerPhone}` : null,
    `내용: ${content}`,
  ].filter(Boolean).join("\n");

  let extracted: ExtractedFields;
  try {
    extracted = await extractWithOpenAI(memoText);
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 502);
  }

  // category2가 category1의 허용 목록에 없으면 안전하게 null 처리 (register.html select와 불일치 방지)
  if (extracted.category1 && extracted.category2) {
    const allowed = CATEGORY_OPTIONS[extracted.category1] || [];
    if (!allowed.includes(extracted.category2)) extracted.category2 = null;
  }

  let buildingRegisterRaw: unknown = null;
  let areaFromRegister: number | null = null;
  let registerDetailNote = "";
  const confidenceNotes: string[] = [];

  if (extracted.address) {
    try {
      const parsed = parseAddress(extracted.address);
      if (!parsed) {
        confidenceNotes.push(`주소("${extracted.address}")에서 지번을 인식하지 못해 건축물대장 조회를 건너뛰었습니다.`);
      } else {
        const { raw, item } = await lookupBuildingRegister(parsed);
        buildingRegisterRaw = raw;
        if (item) {
          const totArea = Number(item.totArea);
          if (Number.isFinite(totArea) && totArea > 0) areaFromRegister = totArea;
          const parts = [
            item.mainPurpsCdNm ? `주용도: ${item.mainPurpsCdNm}` : null,
            (item.grndFlrCnt || item.ugrndFlrCnt) ? `층수: 지상 ${item.grndFlrCnt ?? "?"}층/지하 ${item.ugrndFlrCnt ?? "0"}층` : null,
            item.strctCdNm ? `구조: ${item.strctCdNm}` : null,
            item.useAprDay ? `사용승인일: ${item.useAprDay}` : null,
          ].filter(Boolean);
          registerDetailNote = parts.length ? `[건축물대장 조회 결과]\n${parts.join("\n")}` : "";
        } else {
          confidenceNotes.push("건축물대장에서 일치하는 건축물을 찾지 못했습니다.");
        }
      }
    } catch (err) {
      confidenceNotes.push(`건축물대장 조회 실패: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const finalAreaM2 = areaFromRegister ?? extracted.area_m2;
  const finalDetailDescription = [extracted.detail_description, registerDetailNote]
    .filter(Boolean)
    .join("\n\n") || null;

  const insertPayload = {
    source_diary_id: diaryId || null,
    status: "pending",
    category1: extracted.category1,
    category2: extracted.category2,
    deal_type: extracted.deal_type,
    title: extracted.title,
    address: extracted.address,
    sale_price: extracted.sale_price,
    deposit: extracted.deposit,
    monthly_rent: extracted.monthly_rent,
    area_m2: finalAreaM2,
    floor_info: extracted.floor_info,
    detail_description: finalDetailDescription,
    customer_name: customerName || null,
    customer_phone: customerPhone || null,
    building_register_raw: buildingRegisterRaw,
    ai_confidence_note: confidenceNotes.length ? confidenceNotes.join(" / ") : null,
  };

  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/listing_intakes`, {
    method: "POST",
    headers: {
      "apikey": SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
    },
    body: JSON.stringify(insertPayload),
  });

  if (!insertRes.ok) {
    const errText = await insertRes.text().catch(() => "");
    return jsonResponse({ error: `listing_intakes 저장 실패: ${errText.slice(0, 300)}` }, 500);
  }

  const [inserted] = await insertRes.json();
  return jsonResponse({ id: inserted.id, notes: confidenceNotes });
});
