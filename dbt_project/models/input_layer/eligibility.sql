-- Maps AQSoft members table to Tuva's eligibility input schema
-- All fields cast to correct types (DuckDB is strict about type matching)

with source as (
    select * from {{ source('aqsoft', 'members') }}
)

select
    cast(member_id as varchar)                  as person_id,
    cast(member_id as varchar)                  as member_id,
    cast(null as varchar)                       as subscriber_id,
    case
        when upper(gender) = 'M' then 'male'
        when upper(gender) = 'F' then 'female'
        else cast(gender as varchar)
    end                                         as gender,
    cast(null as varchar)                       as race,
    date_of_birth                               as birth_date,
    cast(null as date)                          as death_date,
    cast(0 as integer)                          as death_flag,
    coverage_start                              as enrollment_start_date,
    coalesce(coverage_end, cast('2026-12-31' as date)) as enrollment_end_date,
    cast('medicare' as varchar)                  as payer,
    cast('medicare' as varchar)                   as payer_type,
    cast(plan_product as varchar)               as plan,
    cast(null as varchar)                       as original_reason_entitlement_code,
    case when medicaid_status then '02' else '00' end as dual_status_code,
    cast(null as varchar)                       as medicare_status_code,
    cast(null as varchar)                       as enrollment_status,
    cast(null as integer)                       as hospice_flag,
    cast(null as varchar)                       as institutional_snp_flag,
    case when institutional then cast(1 as integer) else cast(0 as integer) end as long_term_institutional_flag,
    cast(null as varchar)                       as group_id,
    cast(null as varchar)                       as group_name,
    cast(null as varchar)                       as name_suffix,
    cast(first_name as varchar)                 as first_name,
    cast(null as varchar)                       as middle_name,
    cast(last_name as varchar)                  as last_name,
    cast(null as varchar)                       as social_security_number,
    cast(null as varchar)                       as subscriber_relation,
    cast(null as varchar)                       as address,
    cast(null as varchar)                       as city,
    cast(null as varchar)                       as state,
    cast(zip_code as varchar)                   as zip_code,
    cast(null as varchar)                       as phone,
    cast(null as varchar)                       as email,
    cast(null as varchar)                       as ethnicity,
    'aqsoft'                                    as data_source,
    cast(null as varchar)                       as file_name,
    cast(null as date)                          as file_date,
    current_timestamp                           as ingest_datetime
from source
