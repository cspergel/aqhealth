-- Maps AQSoft encounters (one per record-tier claim) to Tuva's
-- input_layer__encounter contract.
-- Source: raw.encounter (written by TuvaExportService.export_encounters)

with source as (
    select * from {{ source('aqsoft', 'encounter') }}
)

select
    cast(encounter_id as varchar)                     as encounter_id,
    cast(person_id as varchar)                        as person_id,
    cast(patient_id as varchar)                       as patient_id,
    cast(encounter_type as varchar)                   as encounter_type,
    cast(encounter_start_date as date)                as encounter_start_date,
    cast(encounter_end_date as date)                  as encounter_end_date,
    cast(length_of_stay as integer)                   as length_of_stay,
    cast(admit_source_code as varchar)                as admit_source_code,
    cast(admit_source_description as varchar)         as admit_source_description,
    cast(admit_type_code as varchar)                  as admit_type_code,
    cast(admit_type_description as varchar)           as admit_type_description,
    cast(discharge_disposition_code as varchar)       as discharge_disposition_code,
    cast(discharge_disposition_description as varchar) as discharge_disposition_description,
    cast(attending_provider_id as varchar)            as attending_provider_id,
    cast(attending_provider_name as varchar)          as attending_provider_name,
    cast(facility_id as varchar)                      as facility_id,
    cast(facility_name as varchar)                    as facility_name,
    cast(primary_diagnosis_code_type as varchar)      as primary_diagnosis_code_type,
    cast(primary_diagnosis_code as varchar)           as primary_diagnosis_code,
    cast(primary_diagnosis_description as varchar)    as primary_diagnosis_description,
    cast(drg_code_type as varchar)                    as drg_code_type,
    cast(drg_code as varchar)                         as drg_code,
    cast(drg_description as varchar)                  as drg_description,
    cast(paid_amount as double)                       as paid_amount,
    cast(allowed_amount as double)                    as allowed_amount,
    cast(charge_amount as double)                     as charge_amount,
    cast(data_source as varchar)                      as data_source,
    cast(file_name as varchar)                        as file_name,
    current_timestamp                                 as ingest_datetime
from source
