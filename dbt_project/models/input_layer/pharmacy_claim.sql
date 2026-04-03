-- Maps AQSoft pharmacy claims to Tuva's pharmacy_claim input schema

with source as (
    select * from {{ source('aqsoft', 'claims') }}
    where claim_type = 'pharmacy'
)

select
    claim_id                                    as claim_id,
    1                                           as claim_line_number,
    cast(member_id as varchar)                  as person_id,
    cast(member_id as varchar)                  as member_id,
    null                                        as payer,
    null                                        as plan,
    null                                        as prescribing_provider_npi,
    null                                        as dispensing_provider_npi,
    service_date                                as dispensing_date,
    ndc_code                                    as ndc_code,
    cast(quantity as integer)                   as quantity,
    days_supply                                 as days_supply,
    null                                        as refills,
    paid_date                                   as paid_date,
    cast(paid_amount as float)                  as paid_amount,
    cast(allowed_amount as float)               as allowed_amount,
    cast(billed_amount as float)                as charge_amount,
    null                                        as coinsurance_amount,
    null                                        as copayment_amount,
    null                                        as deductible_amount,
    null                                        as in_network_flag,
    'aqsoft'                                    as data_source,
    null                                        as file_name,
    null                                        as file_date,
    current_timestamp                           as ingest_datetime
from source
