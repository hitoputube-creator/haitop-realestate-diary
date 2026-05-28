import { useEffect, useState } from 'react'
import './PropertyForm.css'

const PROPERTY_TYPES = ['아파트', '오피스텔', '빌라/연립', '단독/다가구', '상가', '사무실', '토지', '창고/공장', '기타']
const DEAL_TYPES = ['매매', '전세', '월세']
const DIRECTIONS = ['동', '서', '남', '북', '남동', '남서', '북동', '북서']
const WRITERS = ['주현희', '김정현']

const INITIAL = {
  propertyType: '아파트',
  dealType: '매매',
  address: '',
  addressDetail: '',
  exclusiveArea: '',
  supplyArea: '',
  price: '',
  deposit: '',
  monthly: '',
  floor: '',
  totalFloor: '',
  rooms: '',
  bathrooms: '',
  direction: '',
  parking: '',
  moveInDate: '',
  owner: '',
  ownerPhone: '',
  writer: '주현희',
  remarks: '',
}

export default function PropertyForm({ onBack }) {
  const [form, setForm] = useState(INITIAL)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const memo = sessionStorage.getItem('property_memo')
    if (memo) {
      setForm((prev) => ({ ...prev, remarks: memo }))
      sessionStorage.removeItem('property_memo')
    }
  }, [])

  function set(field) {
    return (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const isPriceVisible = form.dealType === '매매'
  const isDepositVisible = form.dealType === '전세' || form.dealType === '월세'
  const isMonthlyVisible = form.dealType === '월세'

  return (
    <div className="pf-app">
      <header className="pf-header">
        <button type="button" className="pf-back-btn" onClick={onBack} aria-label="업무일지로 돌아가기">
          ← 업무일지
        </button>
        <div className="pf-brand">
          <div className="pf-brand-mark">H</div>
          <div>
            <div className="pf-brand-title">하이탑 매물관리</div>
            <div className="pf-brand-sub">Property Register</div>
          </div>
        </div>
      </header>

      <main className="pf-main">
        <h2 className="pf-page-title">매물 등록</h2>

        {saved && (
          <div className="pf-toast" role="status">
            매물이 등록되었습니다.
          </div>
        )}

        <form className="pf-form" onSubmit={handleSubmit} noValidate>

          {/* 기본 분류 */}
          <section className="pf-section">
            <h3 className="pf-section-title">거래 정보</h3>
            <div className="pf-row">
              <div className="pf-field">
                <label className="pf-label" htmlFor="pf-property-type">매물 유형</label>
                <select id="pf-property-type" className="pf-select" value={form.propertyType} onChange={set('propertyType')}>
                  {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="pf-field">
                <label className="pf-label" htmlFor="pf-deal-type">거래 유형</label>
                <div className="pf-radio-group" role="group" aria-label="거래 유형">
                  {DEAL_TYPES.map((d) => (
                    <label key={d} className={`pf-radio-btn ${form.dealType === d ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name="dealType"
                        value={d}
                        checked={form.dealType === d}
                        onChange={set('dealType')}
                      />
                      {d}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="pf-row">
              {isPriceVisible && (
                <div className="pf-field">
                  <label className="pf-label" htmlFor="pf-price">매매가 (만원)</label>
                  <input id="pf-price" className="pf-input" type="text" placeholder="예: 38,000" value={form.price} onChange={set('price')} />
                </div>
              )}
              {isDepositVisible && (
                <div className="pf-field">
                  <label className="pf-label" htmlFor="pf-deposit">{form.dealType === '전세' ? '전세금 (만원)' : '보증금 (만원)'}</label>
                  <input id="pf-deposit" className="pf-input" type="text" placeholder="예: 10,000" value={form.deposit} onChange={set('deposit')} />
                </div>
              )}
              {isMonthlyVisible && (
                <div className="pf-field">
                  <label className="pf-label" htmlFor="pf-monthly">월세 (만원)</label>
                  <input id="pf-monthly" className="pf-input" type="text" placeholder="예: 80" value={form.monthly} onChange={set('monthly')} />
                </div>
              )}
            </div>
          </section>

          {/* 위치 */}
          <section className="pf-section">
            <h3 className="pf-section-title">위치</h3>
            <div className="pf-field pf-field-full">
              <label className="pf-label" htmlFor="pf-address">주소 (도로명/지번)</label>
              <input id="pf-address" className="pf-input" type="text" placeholder="예: 경기도 파주시 운정동 000" value={form.address} onChange={set('address')} />
            </div>
            <div className="pf-field pf-field-full">
              <label className="pf-label" htmlFor="pf-address-detail">동/호수</label>
              <input id="pf-address-detail" className="pf-input" type="text" placeholder="예: 101동 1202호" value={form.addressDetail} onChange={set('addressDetail')} />
            </div>
          </section>

          {/* 면적 & 층 */}
          <section className="pf-section">
            <h3 className="pf-section-title">면적 및 층수</h3>
            <div className="pf-row">
              <div className="pf-field">
                <label className="pf-label" htmlFor="pf-exclusive-area">전용면적 (㎡)</label>
                <input id="pf-exclusive-area" className="pf-input" type="text" placeholder="예: 59.97" value={form.exclusiveArea} onChange={set('exclusiveArea')} />
              </div>
              <div className="pf-field">
                <label className="pf-label" htmlFor="pf-supply-area">공급면적 (㎡)</label>
                <input id="pf-supply-area" className="pf-input" type="text" placeholder="예: 84.97" value={form.supplyArea} onChange={set('supplyArea')} />
              </div>
              <div className="pf-field">
                <label className="pf-label" htmlFor="pf-floor">해당 층</label>
                <input id="pf-floor" className="pf-input" type="text" placeholder="예: 12" value={form.floor} onChange={set('floor')} />
              </div>
              <div className="pf-field">
                <label className="pf-label" htmlFor="pf-total-floor">총 층수</label>
                <input id="pf-total-floor" className="pf-input" type="text" placeholder="예: 25" value={form.totalFloor} onChange={set('totalFloor')} />
              </div>
            </div>
          </section>

          {/* 세부 정보 */}
          <section className="pf-section">
            <h3 className="pf-section-title">세부 정보</h3>
            <div className="pf-row">
              <div className="pf-field">
                <label className="pf-label" htmlFor="pf-rooms">방 수</label>
                <input id="pf-rooms" className="pf-input" type="text" placeholder="예: 3" value={form.rooms} onChange={set('rooms')} />
              </div>
              <div className="pf-field">
                <label className="pf-label" htmlFor="pf-bathrooms">욕실 수</label>
                <input id="pf-bathrooms" className="pf-input" type="text" placeholder="예: 2" value={form.bathrooms} onChange={set('bathrooms')} />
              </div>
              <div className="pf-field">
                <label className="pf-label" htmlFor="pf-direction">방향</label>
                <select id="pf-direction" className="pf-select" value={form.direction} onChange={set('direction')}>
                  <option value="">선택</option>
                  {DIRECTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="pf-field">
                <label className="pf-label" htmlFor="pf-parking">주차 (대)</label>
                <input id="pf-parking" className="pf-input" type="text" placeholder="예: 1" value={form.parking} onChange={set('parking')} />
              </div>
            </div>
            <div className="pf-row">
              <div className="pf-field">
                <label className="pf-label" htmlFor="pf-move-in">입주 가능일</label>
                <input id="pf-move-in" className="pf-input" type="date" value={form.moveInDate} onChange={set('moveInDate')} />
              </div>
            </div>
          </section>

          {/* 소유자 / 담당자 */}
          <section className="pf-section">
            <h3 className="pf-section-title">소유자 / 담당자</h3>
            <div className="pf-row">
              <div className="pf-field">
                <label className="pf-label" htmlFor="pf-owner">소유자</label>
                <input id="pf-owner" className="pf-input" type="text" placeholder="이름" value={form.owner} onChange={set('owner')} />
              </div>
              <div className="pf-field">
                <label className="pf-label" htmlFor="pf-owner-phone">소유자 연락처</label>
                <input id="pf-owner-phone" className="pf-input" type="tel" placeholder="010-0000-0000" value={form.ownerPhone} onChange={set('ownerPhone')} />
              </div>
              <div className="pf-field">
                <label className="pf-label" htmlFor="pf-writer">담당자</label>
                <select id="pf-writer" className="pf-select" value={form.writer} onChange={set('writer')}>
                  {WRITERS.map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
            </div>
          </section>

          {/* 특이사항/메모 — 업무일지에서 자동 입력 */}
          <section className="pf-section">
            <h3 className="pf-section-title">특이사항 / 메모</h3>
            <div className="pf-field pf-field-full">
              <label className="pf-label" htmlFor="pf-remarks">
                특이사항 / 메모
                {form.remarks && <span className="pf-label-badge">업무일지에서 불러옴</span>}
              </label>
              <textarea
                id="pf-remarks"
                className="pf-textarea"
                rows={5}
                placeholder="매물 관련 특이사항, 메모 등을 입력하세요."
                value={form.remarks}
                onChange={set('remarks')}
              />
            </div>
          </section>

          <div className="pf-form-footer">
            <button type="button" className="pf-btn pf-btn-outline" onClick={onBack}>
              취소
            </button>
            <button type="submit" className="pf-btn pf-btn-primary">
              매물 등록
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
