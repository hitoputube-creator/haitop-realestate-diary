import { useRef, useState } from 'react'
import { UNJEONG_BLOCKS } from './unjeongBlocks'
import './UnjeongBlockOverview.css'

const MIN_SCALE = 0.75
const MAX_SCALE = 2.8
const ZOOM_STEP = 0.18
const INITIAL_SCALE = 0.82

function clampScale(value) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(value.toFixed(2))))
}

export default function UnjeongBlockOverview({ selectedBlock, onSelectBlock, onOpenBlock }) {
  const viewportRef = useRef(null)
  const dragRef = useRef(null)
  const [scale, setScale] = useState(INITIAL_SCALE)
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  function zoom(delta) {
    setScale((value) => clampScale(value + delta))
  }

  function resetView() {
    setScale(INITIAL_SCALE)
    setOffset({ x: 0, y: 0 })
  }

  function fitView() {
    setScale(INITIAL_SCALE)
    setOffset({ x: 0, y: 0 })
  }

  function beginDrag(event) {
    if (event.target.closest('button')) return
    viewportRef.current?.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    }
  }

  function moveDrag(event) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setOffset({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    })
  }

  function endDrag(event) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null
      viewportRef.current?.releasePointerCapture(event.pointerId)
    }
  }

  function handleWheel(event) {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    zoom(event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP)
  }

  function selectBlock(block) {
    onSelectBlock(block)
    if (window.matchMedia('(max-width: 760px)').matches) {
      setTimeout(() => {
        document.querySelector('.ll-info-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 80)
    }
  }

  return (
    <section className="ub-overview" aria-label="운정3지구 전체지도">
      <div className="ub-map-head">
        <div>
          <h2>운정3지구 전체지도</h2>
          <p>C1부터 C18까지 빨간 블록 표시를 선택해 내부 관리 정보를 확인합니다.</p>
        </div>
        <div className="ub-map-tools" aria-label="지도 조작">
          <button type="button" onClick={() => zoom(ZOOM_STEP)}>확대</button>
          <button type="button" onClick={() => zoom(-ZOOM_STEP)}>축소</button>
          <button type="button" onClick={fitView}>전체 맞춤</button>
          <button type="button" onClick={resetView}>초기화</button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="ub-map-viewport"
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={handleWheel}
      >
        <div
          className="ub-map-layer"
          style={{ transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})` }}
        >
          <picture>
            <source srcSet={`${import.meta.env.BASE_URL}assets/landlots/unj3-block-overview.webp`} type="image/webp" />
            <img
              src={`${import.meta.env.BASE_URL}assets/landlots/unj3-block-overview.png`}
              alt="파주 운정3지구 단독택지 전체 토지이용계획도"
              draggable="false"
            />
          </picture>
          {UNJEONG_BLOCKS.map((block) => {
            const active = selectedBlock?.blockCode === block.blockCode
            return (
              <button
                key={block.blockCode}
                type="button"
                className={`ub-block-hotspot ${active ? 'active' : ''}`}
                style={{
                  left: `${block.xPercent}%`,
                  top: `${block.yPercent}%`,
                  width: `${block.widthPercent}%`,
                  height: `${block.heightPercent}%`,
                }}
                aria-label={`${block.blockName} 선택`}
                aria-pressed={active}
                onClick={() => selectBlock(block)}
              />
            )
          })}
        </div>
      </div>

      <div className="ub-map-foot">
        <span>배율 {Math.round(scale * 100)}%</span>
        <span>마우스 드래그로 이동, Ctrl+휠로 확대·축소</span>
        <button type="button" onClick={() => onOpenBlock(selectedBlock)}>선택 블록 상세 준비</button>
      </div>
    </section>
  )
}
