-- Read-only diagnostics for work_diary/customer field separation.
-- Run one SELECT block at a time in Supabase SQL Editor.
-- This file avoids returning customer names, raw phone numbers, content, or file names.
-- If the first query shows a table as null, skip later queries that read that table.

-- 0. Required table existence check
-- 아래 쿼리만 선택한 뒤 Run을 누르세요.
select
  to_regclass('public.work_diary') as work_diary_table,
  to_regclass('public.customers') as customers_table;

-- 1. work_diary 고객 필드 이상 후보
-- 아래 쿼리만 선택한 뒤 Run을 누르세요.
-- work_diary_table이 null이면 이 쿼리를 건너뛰세요.
-- 고객명/전화번호/본문은 출력하지 않고 길이, null 여부, 마스킹 값만 출력합니다.
with diary as (
  select
    to_jsonb(w)->>'id' as id,
    to_jsonb(w)->>'customer_id' as customer_id,
    to_jsonb(w)->>'title' as title,
    to_jsonb(w)->>'customer_name' as customer_name,
    to_jsonb(w)->>'customer_phone' as customer_phone,
    to_jsonb(w)->>'date' as date,
    to_jsonb(w)->>'created_at' as created_at
  from public.work_diary w
  where coalesce(to_jsonb(w)->>'link_key', '') <> '__daily_schedule__'
),
issues as (
  select
    id,
    'missing_title' as issue_type,
    customer_id is not null as has_customer_id,
    customer_name is null as customer_name_is_null,
    btrim(coalesce(customer_name, '')) = '' as customer_name_is_blank,
    customer_phone is null as customer_phone_is_null,
    btrim(coalesce(customer_phone, '')) = '' as customer_phone_is_blank,
    length(coalesce(title, '')) as title_length,
    length(coalesce(customer_name, '')) as customer_name_length,
    case
      when customer_phone is null or btrim(customer_phone) = '' then null
      else repeat('*', greatest(length(regexp_replace(customer_phone, '[^0-9]', '', 'g')) - 4, 0))
        || right(regexp_replace(customer_phone, '[^0-9]', '', 'g'), 4)
    end as masked_phone,
    false as title_equals_customer_name,
    date,
    created_at
  from diary
  where title is null or btrim(title) = ''

  union all

  select
    id,
    'customer_id_without_customer_name' as issue_type,
    customer_id is not null,
    customer_name is null,
    btrim(coalesce(customer_name, '')) = '',
    customer_phone is null,
    btrim(coalesce(customer_phone, '')) = '',
    length(coalesce(title, '')),
    length(coalesce(customer_name, '')),
    case
      when customer_phone is null or btrim(customer_phone) = '' then null
      else repeat('*', greatest(length(regexp_replace(customer_phone, '[^0-9]', '', 'g')) - 4, 0))
        || right(regexp_replace(customer_phone, '[^0-9]', '', 'g'), 4)
    end,
    false,
    date,
    created_at
  from diary
  where customer_id is not null
    and (customer_name is null or btrim(customer_name) = '')

  union all

  select
    id,
    'title_equals_customer_name' as issue_type,
    customer_id is not null,
    customer_name is null,
    btrim(coalesce(customer_name, '')) = '',
    customer_phone is null,
    btrim(coalesce(customer_phone, '')) = '',
    length(coalesce(title, '')),
    length(coalesce(customer_name, '')),
    case
      when customer_phone is null or btrim(customer_phone) = '' then null
      else repeat('*', greatest(length(regexp_replace(customer_phone, '[^0-9]', '', 'g')) - 4, 0))
        || right(regexp_replace(customer_phone, '[^0-9]', '', 'g'), 4)
    end,
    true,
    date,
    created_at
  from diary
  where btrim(coalesce(title, '')) <> ''
    and btrim(coalesce(title, '')) = btrim(coalesce(customer_name, ''))

)
select *
from issues
order by created_at desc
limit 200;

-- 2. orphan customer_id 후보
-- 아래 쿼리만 선택한 뒤 Run을 누르세요.
-- work_diary_table 또는 customers_table이 null이면 이 쿼리를 건너뛰세요.
-- 고객명/전화번호/본문은 출력하지 않고 길이, null 여부, 마스킹 값만 출력합니다.
select
  to_jsonb(w)->>'id' as id,
  'missing_customer_row' as issue_type,
  to_jsonb(w)->>'customer_id' is not null as has_customer_id,
  to_jsonb(w)->>'customer_name' is null as customer_name_is_null,
  btrim(coalesce(to_jsonb(w)->>'customer_name', '')) = '' as customer_name_is_blank,
  to_jsonb(w)->>'customer_phone' is null as customer_phone_is_null,
  btrim(coalesce(to_jsonb(w)->>'customer_phone', '')) = '' as customer_phone_is_blank,
  length(coalesce(to_jsonb(w)->>'title', '')) as title_length,
  length(coalesce(to_jsonb(w)->>'customer_name', '')) as customer_name_length,
  case
    when to_jsonb(w)->>'customer_phone' is null or btrim(to_jsonb(w)->>'customer_phone') = '' then null
    else repeat('*', greatest(length(regexp_replace(to_jsonb(w)->>'customer_phone', '[^0-9]', '', 'g')) - 4, 0))
      || right(regexp_replace(to_jsonb(w)->>'customer_phone', '[^0-9]', '', 'g'), 4)
  end as masked_phone,
  to_jsonb(w)->>'date' as date,
  to_jsonb(w)->>'created_at' as created_at
from public.work_diary w
left join public.customers c on to_jsonb(c)->>'id' = to_jsonb(w)->>'customer_id'
where coalesce(to_jsonb(w)->>'link_key', '') <> '__daily_schedule__'
  and to_jsonb(w)->>'customer_id' is not null
  and to_jsonb(c)->>'id' is null
order by to_jsonb(w)->>'created_at' desc
limit 100;

-- 3. 동일 전화번호를 가진 중복 고객 후보
-- 아래 쿼리만 선택한 뒤 Run을 누르세요.
-- customers_table이 null이면 이 쿼리를 건너뛰세요.
-- 전화번호는 마지막 4자리만 보이도록 마스킹합니다.
select
  repeat('*', greatest(length(to_jsonb(c)->>'phone_normalized') - 4, 0)) || right(to_jsonb(c)->>'phone_normalized', 4) as masked_phone,
  count(*) as customer_count,
  array_agg(to_jsonb(c)->>'id' order by to_jsonb(c)->>'created_at' desc) as customer_ids
from public.customers c
where to_jsonb(c)->>'phone_normalized' is not null
  and to_jsonb(c)->>'phone_normalized' <> ''
group by to_jsonb(c)->>'phone_normalized'
having count(*) > 1
order by customer_count desc;
