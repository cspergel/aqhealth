-- Maps AQSoft medications (pharmacy-only claims) to Tuva's
-- input_layer__medication contract.
-- Source: raw.medication (written by TuvaExportService.export_medications)

with source as (
    select * from {{ source('aqsoft', 'medication') }}
)

select
    cast(medication_id as varchar)         as medication_id,
    cast(person_id as varchar)             as person_id,
    cast(payer as varchar)                 as payer,
    cast(patient_id as varchar)            as patient_id,
    cast(encounter_id as varchar)          as encounter_id,
    cast(dispensing_date as date)          as dispensing_date,
    cast(prescribing_date as date)         as prescribing_date,
    cast(source_code_type as varchar)      as source_code_type,
    cast(source_code as varchar)           as source_code,
    cast(source_description as varchar)    as source_description,
    cast(ndc_code as varchar)              as ndc_code,
    cast(ndc_description as varchar)       as ndc_description,
    cast(rxnorm_code as varchar)           as rxnorm_code,
    cast(rxnorm_description as varchar)    as rxnorm_description,
    cast(atc_code as varchar)              as atc_code,
    cast(atc_description as varchar)       as atc_description,
    cast(route as varchar)                 as route,
    cast(strength as varchar)              as strength,
    cast(quantity as integer)              as quantity,
    cast(quantity_unit as varchar)         as quantity_unit,
    cast(days_supply as integer)           as days_supply,
    cast(practitioner_id as varchar)       as practitioner_id,
    cast(data_source as varchar)           as data_source,
    cast(file_name as varchar)             as file_name,
    current_timestamp                      as ingest_datetime
from source
