function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== ''
}

function nullableText(value) {
  return hasValue(value) ? String(value).trim() : null
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined)
}

export function buildCustomerMemoPayload(sourceMemo = {}, formValues = {}, linkedCustomer = null) {
  const title = firstDefined(formValues.title, sourceMemo.title)
  const customerName = firstDefined(
    formValues.customerName,
    formValues.customer_name,
    sourceMemo.customer_name
  )
  const customerPhone = firstDefined(
    formValues.phone,
    formValues.customer_phone,
    sourceMemo.customer_phone
  )
  const customerId = firstDefined(
    linkedCustomer?.id,
    formValues.customerId,
    formValues.customer_id,
    sourceMemo.customer_id
  )

  return {
    title: nullableText(title),
    customer_name: nullableText(customerName),
    customer_phone: nullableText(customerPhone),
    customer_id: nullableText(customerId),
    content: nullableText(formValues.content),
    date: nullableText(formValues.date),
    author: nullableText(formValues.writer ?? formValues.author),
  }
}
