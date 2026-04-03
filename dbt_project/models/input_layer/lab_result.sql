-- Maps lab results from eCW/EMR observations to Tuva's lab_result input schema
-- Source: raw.lab_result (exported from signal-tier claims with observation data)
-- This enables Tuva's lab-based HCC suspects (eGFR -> CKD staging, A1c -> diabetes)

with source as (
    select * from {{ source('aqsoft', 'lab_result') }}
)

select
    cast(lab_result_id as varchar)              as lab_result_id,
    cast(person_id as varchar)                  as person_id,
    cast(null as varchar)                       as encounter_id,
    cast(null as varchar)                       as accession_number,
    cast(result_date as date)                   as result_date,
    cast(collection_date as date)               as collection_date,
    cast(source_code_type as varchar)           as source_code_type,
    cast(source_code as varchar)                as source_code,
    cast(source_description as varchar)         as source_description,
    cast(normalized_code_type as varchar)        as normalized_code_type,
    cast(normalized_code as varchar)            as normalized_code,
    cast(normalized_description as varchar)     as normalized_description,
    cast(null as varchar)                       as status,
    cast(result as varchar)                     as result,
    cast(null as date)                          as result_date_2,
    cast(result_unit as varchar)                as result_unit,
    cast(reference_range_low as varchar)        as reference_range_low,
    cast(reference_range_high as varchar)       as reference_range_high,
    cast(data_source as varchar)                as data_source,
    cast(null as varchar)                       as file_name,
    cast(null as date)                          as file_date,
    current_timestamp                           as ingest_datetime
from source
