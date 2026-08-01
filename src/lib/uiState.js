/*
 * 화면 상태(선택 날짜, 필터, 검색어, 스크롤 위치, 작성 중인 메모 등)를
 * localStorage에 저장/복원하기 위한 공용 유틸.
 * sessionStorage가 아닌 localStorage를 쓰는 이유 — 모바일 브라우저는 다른 탭/앱으로
 * 전환했다가 돌아오면 메모리 확보를 위해 탭을 통째로 다시 로드하는 경우가 있는데,
 * 이때도 값이 남아있어야 하기 때문이다.
 */

export function readLocalJSON(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function writeLocalJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // localStorage를 쓸 수 없어도(시크릿 모드 용량 초과 등) 화면 동작은 계속돼야 하므로 무시
  }
}

// 기존에 저장된 값과 병합해서 저장 — 서로 다른 컴포넌트가 각자 필드만 갱신해도
// 다른 컴포넌트가 저장해둔 필드를 덮어쓰지 않는다.
export function patchLocalJSON(key, patch) {
  const prev = readLocalJSON(key) || {}
  writeLocalJSON(key, { ...prev, ...patch })
}

export function removeLocalJSON(key) {
  try {
    localStorage.removeItem(key)
  } catch {
    // 무시
  }
}
