-- Maps AQSoft observations (vitals, social history, ecw extracts) to
-- Tuva's input_layer__observation contract.
-- Source: raw.observation (written by TuvaExportService.export_observations_tuva)

with source as (
    select * from {{ source('aqsoft', 'observation') }}
)

select
    cast(observation_id as varchar)                      as observation_id,
    cast(person_id as varchar)                           as person_id,
    cast(payer as varchar)                               as payer,
    cast(patient_id as varchar)                          as patient_id,
    cast(encounter_id as varchar)                        as encounter_id,
    cast(panel_id as varchar)                            as panel_id,
    cast(observation_date as date)                       as observation_date,
    cast(observation_type as varchar)                    as observation_type,
    cast(source_code_type as varchar)                    as source_code_type,
    cast(source_code as varchar)                         as source_code,
    cast(source_description as varchar)                  as source_description,
    cast(normalized_code_type as varchar)                as normalized_code_type,
    cast(normalized_code as varchar)                     as normalized_code,
    cast(normalized_description as varchar)              as normalized_description,
    cast(result as varchar)                              as result,
    cast(source_units as varchar)                        as source_units,
    cast(normalized_units as varchar)                    as normalized_units,
    cast(source_reference_range_low as varchar)          as source_reference_range_low,
    cast(source_reference_range_high as varchar)         as source_reference_range_high,
    cast(normalized_reference_range_low as varchar)      as normalized_reference_range_low,
    cast(normalized_reference_range_high as varchar)     as normalized_reference_range_high,
    cast(data_source as varchar)                         as data_source,
    cast(file_name as varchar)                           as file_name,
    current_timestamp                                    as ingest_datetime
from source
