-- Maps AQSoft procedures (HCPCS/CPT codes on claims) to Tuva's
-- input_layer__procedure contract.
-- Source: raw.procedure (written by TuvaExportService.export_procedures)

with source as (
    select * from {{ source('aqsoft', 'procedure') }}
)

select
    cast(procedure_id as varchar)           as procedure_id,
    cast(person_id as varchar)              as person_id,
    cast(patient_id as varchar)             as patient_id,
    cast(encounter_id as varchar)           as encounter_id,
    cast(claim_id as varchar)               as claim_id,
    cast(procedure_date as date)            as procedure_date,
    cast(source_code_type as varchar)       as source_code_type,
    cast(source_code as varchar)            as source_code,
    cast(source_description as varchar)     as source_description,
    cast(normalized_code_type as varchar)   as normalized_code_type,
    cast(normalized_code as varchar)        as normalized_code,
    cast(normalized_description as varchar) as normalized_description,
    cast(modifier_1 as varchar)             as modifier_1,
    cast(modifier_2 as varchar)             as modifier_2,
    cast(modifier_3 as varchar)             as modifier_3,
    cast(modifier_4 as varchar)             as modifier_4,
    cast(modifier_5 as varchar)             as modifier_5,
    cast(practitioner_id as varchar)        as practitioner_id,
    cast(data_source as varchar)            as data_source,
    cast(file_name as varchar)              as file_name,
    current_timestamp                       as ingest_datetime
from source
