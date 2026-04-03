-- Maps AQSoft members table to Tuva's eligibility input schema

with source as (
    select * from {{ source('aqsoft', 'members') }}
)

select
    cast(member_id as varchar)                  as person_id,
    cast(member_id as varchar)                  as member_id,
    null                                        as subscriber_id,
    gender                                      as gender,
    null                                        as race,
    date_of_birth                               as birth_date,
    null                                        as death_date,
    0                                           as death_flag,
    coverage_start                              as enrollment_start_date,
    coalesce(coverage_end, cast('2026-12-31' as date)) as enrollment_end_date,
    health_plan                                 as payer,
    'medicare_advantage'                        as payer_type,
    plan_product                                as plan,
    null                                        as original_reason_entitlement_code,
    case when medicaid_status then '02' else '00' end as dual_status_code,
    null                                        as medicare_status_code,
    null                                        as enrollment_status,
    null                                        as hospice_flag,
    null                                        as institutional_snp_flag,
    case when institutional then 1 else 0 end   as long_term_institutional_flag,
    null                                        as group_id,
    null                                        as group_name,
    null                                        as name_suffix,
    first_name                                  as first_name,
    null                                        as middle_name,
    last_name                                   as last_name,
    null                                        as social_security_number,
    null                                        as subscriber_relation,
    null                                        as address,
    null                                        as city,
    null                                        as state,
    zip_code                                    as zip_code,
    null                                        as phone,
    null                                        as email,
    null                                        as ethnicity,
    'aqsoft'                                    as data_source,
    null                                        as file_name,
    null                                        as file_date,
    current_timestamp                           as ingest_datetime
from source
