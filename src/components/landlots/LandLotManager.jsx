import { useMemo, useState } from 'react'
import UnjeongBlockOverview from './UnjeongBlockOverview'
import { DEFAULT_UNJEONG_BLOCK } from './unjeongBlocks'
import './LandLotManager.css'

function BlockInfoPanel({ block, onOpenBlock }) {
  return (
    <aside className="ll-info-panel" aria-label="선택 블록 정보">
      <div className="ll-info-head">
        <span className="ll-internal-badge">사내 업무용</span>
        <strong>{block.blockName}</strong>
        <p>{block.landType}</p>
      </div>

      <dl className="ll-stats">
        <div>
          <dt>상태</dt>
          <dd>기본자료 준비 중</dd>
        </div>
        <div>
          <dt>등록 필지</dt>
          <dd>{block.parcelCount}건</dd>
        </div>
        <div>
          <dt>매물 후보</dt>
          <dd>{block.candidateCount}건</dd>
        </div>
        <div>
          <dt>실제 매물</dt>
          <dd>{block.listingCount}건</dd>
        </div>
      </dl>

      <button type="button" className="ll-primary-action" onClick={() => onOpenBlock(block)}>
        {block.blockCode} 상세 필지도 준비
      </button>

      <div className="ll-note">
        <strong>외부 홈페이지에 자동 공개되지 않습니다.</strong>
        <p>이번 화면은 내부 택지 업무자료를 정리하기 위한 첫 화면입니다. 필지 명단, 낙찰자료, 연락처, 매물 전환은 다음 단계에서 연결합니다.</p>
      </div>
    </aside>
  )
}

function BlockReadyView({ block, onBack }) {
  return (
    <section className="ll-block-ready" aria-label={`${block.blockCode} 상세 필지도 준비 화면`}>
      <div className="ll-ready-card">
        <span className="ll-internal-badge">사내 업무용</span>
        <h2>{block.blockName}</h2>
        <p>{block.blockCode} 블록 상세 필지도는 다음 단계에서 연결됩니다.</p>
        <dl className="ll-ready-flow">
          <div><dt>현재 단계</dt><dd>전체지도에서 블록 선택</dd></div>
          <div><dt>다음 단계</dt><dd>{block.blockCode} 필지 경계와 필지별 기본정보 연결</dd></div>
          <div><dt>확장 구조</dt><dd>개별 parcel → 연락기록 → 첨부자료 → 매물 전환</dd></div>
        </dl>
        <button type="button" className="ll-secondary-action" onClick={onBack}>
          전체지도 돌아가기
        </button>
      </div>
    </section>
  )
}

export default function LandLotManager() {
  const [viewMode, setViewMode] = useState('overview')
  const [selectedBlock, setSelectedBlock] = useState(DEFAULT_UNJEONG_BLOCK)

  const currentBlock = useMemo(() => selectedBlock || DEFAULT_UNJEONG_BLOCK, [selectedBlock])

  function openBlock(block = currentBlock) {
    setSelectedBlock(block)
    setViewMode('block')
  }

  return (
    <main className="ll-page">
      <header className="ll-hero">
        <div>
          <div className="ll-eyebrow">
            <span>사내 업무용</span>
            <span>홈페이지 비공개</span>
          </div>
          <h1>운정신도시 택지관리</h1>
          <p>운정3지구 블록을 선택해 필지자료와 업무정보를 관리합니다.</p>
        </div>
      </header>

      {viewMode === 'overview' ? (
        <div className="ll-workspace">
          <UnjeongBlockOverview
            selectedBlock={currentBlock}
            onSelectBlock={setSelectedBlock}
            onOpenBlock={openBlock}
          />
          <BlockInfoPanel block={currentBlock} onOpenBlock={openBlock} />
        </div>
      ) : (
        <BlockReadyView block={currentBlock} onBack={() => setViewMode('overview')} />
      )}
    </main>
  )
}
