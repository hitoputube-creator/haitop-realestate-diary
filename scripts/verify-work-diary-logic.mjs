import assert from 'node:assert/strict'
import { buildCustomerMemoPayload } from '../src/lib/workDiaryPayload.js'
import { normalizeAttachmentMime } from '../src/lib/fileMime.js'

const title = '태광자동차공업사'
const customerName = '홍길동'
const phone = '010-1111-2222'

const caseA = buildCustomerMemoPayload(
  {},
  {
    customerId: 'customer-1',
    title,
    customerName,
    phone,
    content: '새 메모',
    date: '2026-08-03',
    writer: '주현정',
  },
  { id: 'customer-1' }
)

assert.equal(caseA.title, title)
assert.equal(caseA.customer_name, customerName)
assert.equal(caseA.customer_phone, phone)
assert.equal(caseA.customer_id, 'customer-1')

const caseB = buildCustomerMemoPayload(
  {},
  {
    customerId: 'linked-after-phone-or-name',
    title,
    customerName,
    phone,
    content: '새 메모',
    date: '2026-08-03',
    writer: '주현정',
  },
  { id: 'linked-after-phone-or-name' }
)

assert.equal(caseB.title, title)
assert.equal(caseB.customer_name, customerName)
assert.equal(caseB.customer_phone, phone)
assert.equal(caseB.customer_id, 'linked-after-phone-or-name')

const caseC = buildCustomerMemoPayload(
  { title },
  {
    title,
    customerName: '',
    phone: '',
    content: '고객 연결 없이 저장',
    date: '2026-08-03',
    writer: '주현정',
  },
  null
)

assert.equal(caseC.title, title)
assert.equal(caseC.customer_name, null)
assert.equal(caseC.customer_phone, null)
assert.equal(caseC.customer_id, null)

const caseD = buildCustomerMemoPayload(
  {},
  {
    title: '',
    customerName,
    phone,
    content: '제목 없는 메모',
    date: '2026-08-03',
    writer: '주현정',
  },
  { id: 'customer-2' }
)

assert.equal(caseD.title, null)
assert.equal(caseD.customer_name, customerName)
assert.equal(caseD.customer_phone, phone)
assert.equal(caseD.customer_id, 'customer-2')

const falseyButValid = buildCustomerMemoPayload(
  {},
  {
    title: 0,
    customerName: false,
    phone: 0,
    customerId: 0,
    content: 0,
    date: '2026-08-03',
    writer: false,
  },
  null
)

assert.equal(falseyButValid.title, '0')
assert.equal(falseyButValid.customer_name, 'false')
assert.equal(falseyButValid.customer_phone, '0')
assert.equal(falseyButValid.customer_id, '0')
assert.equal(falseyButValid.content, '0')
assert.equal(falseyButValid.author, 'false')

assert.equal(normalizeAttachmentMime({ name: 'photo.HEIC', type: '' }), 'image/heic')
assert.equal(normalizeAttachmentMime({ name: 'photo.heif', type: 'image/heif-sequence' }), 'image/heif')
assert.equal(normalizeAttachmentMime({ name: 'photo.jpg', type: 'image/pjpeg' }), 'image/jpeg')
assert.equal(normalizeAttachmentMime({ name: 'scan.pdf', type: '' }), 'application/pdf')
assert.equal(normalizeAttachmentMime({ name: 'report.hwp', type: '' }, 'application/x-hwp'), 'application/x-hwp')

console.log('work diary field mapping and MIME normalization checks passed')
