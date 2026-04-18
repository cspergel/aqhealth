{#
    This macro has been modified to work with the variables set in the dbt_project.yml file.
    See https://docs.getdbt.com/docs/building-a-dbt-project/building-models/using-custom-schemas for the original macro.

    Copied from tuva_demo_data/macros/generate_schema_name.sql so both projects
    emit the same bare schema names (e.g. `cms_hcc`) instead of dbt's default
    `<target>_<custom_schema>` form (e.g. `main_cms_hcc`). This keeps backend
    consumer queries consistent across demo and warehouse DuckDBs and lets us
    drop the `_query_with_schema_fallback` string-replace hack.
#}

{% macro default__generate_schema_name(custom_schema_name, node) -%}
    {%- set default_schema = target.schema -%}
    {%- if custom_schema_name is not none -%}
        {{ custom_schema_name | trim }}
    {%- else -%}
        {{ default_schema }}
    {%- endif -%}
{%- endmacro %}
