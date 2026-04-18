-- Maps AQSoft conditions (derived from ICD-10 codes on claims) to Tuva's
-- input_layer__condition contract. One row per (claim, diagnosis position).
-- Source: raw.condition (written by TuvaExportService.export_conditions)

with source as (
    select * from {{ source('aqsoft', 'condition') }}
)

select
    cast(condition_id as varchar)                as condition_id,
    cast(payer as varchar)                       as payer,
    cast(person_id as varchar)                   as person_id,
    cast(patient_id as varchar)                  as patient_id,
    cast(encounter_id as varchar)                as encounter_id,
    cast(claim_id as varchar)                    as claim_id,
    cast(recorded_date as date)                  as recorded_date,
    cast(onset_date as date)                     as onset_date,
    cast(resolved_date as date)                  as resolved_date,
    cast(status as varchar)                      as status,
    cast(condition_type as varchar)              as condition_type,
    cast(source_code_type as varchar)            as source_code_type,
    cast(source_code as varchar)                 as source_code,
    cast(source_description as varchar)          as source_description,
    cast(normalized_code_type as varchar)        as normalized_code_type,
    cast(normalized_code as varchar)             as normalized_code,
    cast(normalized_description as varchar)      as normalized_description,
    cast(condition_rank as integer)              as condition_rank,
    cast(present_on_admit_code as varchar)       as present_on_admit_code,
    cast(present_on_admit_description as varchar) as present_on_admit_description,
    cast(data_source as varchar)                 as data_source,
    cast(file_name as varchar)                   as file_name,
    current_timestamp                            as ingest_datetime
from source
