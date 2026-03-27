"""
Comprehensive column name alias mapping — canonical platform field names
to all known real-world variations.

This provides deterministic fast-path resolution BEFORE the AI mapper runs.
If a cleaned header exactly matches an alias, we skip the LLM call for that column.

Maintained as a single source of truth.  The mapping_service heuristic map
should defer to this module for alias lookups.
"""

# ---------------------------------------------------------------------------
# Canonical field -> list of known aliases (all lowercase, underscored)
# ---------------------------------------------------------------------------

COLUMN_ALIASES: dict[str, list[str]] = {
    # -----------------------------------------------------------------------
    # Member / Subscriber identifiers
    # -----------------------------------------------------------------------
    "member_id": [
        "member_id", "mbr_id", "mbr_nbr", "member_number", "subscriber_id",
        "sub_id", "hicn", "mbi", "patient_id", "enrollee_id", "member_no",
        "mem_id", "mbrid", "memberid", "subscriber_number", "client_member_id",
        "subscriber_no", "mbr_number", "member_identifier", "mem_nbr",
        "individual_id", "recipient_id", "beneficiary_id", "insured_id",
        "policy_number", "certificate_number", "member_num", "patid",
        "patient_identifier", "subscriber_identifier", "plan_member_id",
        "health_plan_member_id", "internal_member_id", "external_member_id",
    ],

    # -----------------------------------------------------------------------
    # Names
    # -----------------------------------------------------------------------
    "first_name": [
        "first_name", "fname", "first", "member_first", "f_name",
        "given_name", "patient_first_name", "first_nm", "mbr_first_name",
        "member_first_name", "subscriber_first_name", "pat_first_name",
        "firstname", "first_name_1", "forename", "mbr_fname",
        "patient_first", "enrollee_first_name", "beneficiary_first_name",
    ],
    "last_name": [
        "last_name", "lname", "last", "member_last", "l_name", "surname",
        "family_name", "patient_last_name", "last_nm", "mbr_last_name",
        "member_last_name", "subscriber_last_name", "pat_last_name",
        "lastname", "last_name_1", "mbr_lname", "patient_last",
        "enrollee_last_name", "beneficiary_last_name",
    ],
    "middle_name": [
        "middle_name", "mname", "middle", "middle_initial", "mi",
        "member_middle", "m_name", "middle_nm", "mbr_middle_name",
        "patient_middle_name", "middlename",
    ],
    "full_name": [
        "full_name", "member_name", "patient_name", "name", "mbr_name",
        "subscriber_name", "enrollee_name", "beneficiary_name",
        "insured_name", "pat_name", "member_full_name",
    ],
    "name_suffix": [
        "name_suffix", "suffix", "generational_suffix", "name_sfx",
    ],
    "name_prefix": [
        "name_prefix", "prefix", "title", "salutation",
    ],

    # -----------------------------------------------------------------------
    # Demographics
    # -----------------------------------------------------------------------
    "date_of_birth": [
        "date_of_birth", "dob", "birth_date", "birthdate", "birth_dt",
        "date_birth", "member_dob", "patient_dob", "mbr_dob", "bdate",
        "d_o_b", "birthdt", "member_birth_date", "subscriber_dob",
        "pat_dob", "date_of_birth_1", "enrollee_dob", "beneficiary_dob",
        "mbr_birth_date", "patient_birth_date", "birth",
    ],
    "date_of_death": [
        "date_of_death", "dod", "death_date", "deathdate", "death_dt",
        "deceased_date", "member_death_date",
    ],
    "gender": [
        "gender", "sex", "member_gender", "patient_sex", "mbr_gender",
        "member_sex", "subscriber_gender", "patient_gender", "sex_code",
        "gender_code", "mbr_sex",
    ],
    "race": [
        "race", "member_race", "patient_race", "race_code", "race_ethnicity",
    ],
    "ethnicity": [
        "ethnicity", "member_ethnicity", "patient_ethnicity", "ethnic_group",
        "hispanic_indicator",
    ],
    "language": [
        "language", "preferred_language", "primary_language", "language_code",
        "member_language", "spoken_language",
    ],
    "ssn": [
        "ssn", "social_security_number", "social_security", "ss_number",
        "ssn_number", "social_sec_no", "ssno",
    ],

    # -----------------------------------------------------------------------
    # Address / Contact
    # -----------------------------------------------------------------------
    "address": [
        "address", "street", "address_line_1", "street_address",
        "member_address", "address1", "addr1", "address_1",
        "mailing_address", "residential_address", "patient_address",
        "mbr_address", "home_address",
    ],
    "address_line_2": [
        "address_line_2", "address2", "addr2", "address_2", "apt",
        "suite", "unit",
    ],
    "city": [
        "city", "member_city", "patient_city", "mbr_city", "city_name",
        "residence_city",
    ],
    "state": [
        "state", "member_state", "patient_state", "st", "state_code",
        "state_abbr", "mbr_state", "residence_state",
    ],
    "zip_code": [
        "zip_code", "zip", "zipcode", "postal_code", "member_zip",
        "patient_zip", "zip5", "zip_5", "mbr_zip", "mailing_zip",
        "residence_zip", "postal", "zip_cd",
    ],
    "county": [
        "county", "county_name", "county_code", "fips_code",
        "county_fips", "residence_county",
    ],
    "phone": [
        "phone", "phone_number", "telephone", "member_phone",
        "contact_phone", "home_phone", "primary_phone", "phone_nbr",
        "mbr_phone", "patient_phone", "daytime_phone",
    ],
    "email": [
        "email", "email_address", "member_email", "patient_email",
        "contact_email", "e_mail",
    ],

    # -----------------------------------------------------------------------
    # Coverage / Enrollment
    # -----------------------------------------------------------------------
    "health_plan": [
        "health_plan", "plan_name", "payer", "payer_name",
        "insurance_name", "carrier", "health_plan_name", "plan",
        "insurance_carrier", "insurance_company", "payor",
    ],
    "plan_product": [
        "plan_product", "product", "plan_type", "lob", "line_of_business",
        "product_type", "benefit_plan", "plan_code", "product_name",
        "coverage_type",
    ],
    "coverage_start": [
        "coverage_start", "effective_date", "eff_date", "start_date",
        "enrollment_date", "eligibility_start", "coverage_effective_date",
        "member_effective_date", "eff_dt", "effective_dt",
        "enrollment_start", "coverage_begin_date", "benefit_start_date",
    ],
    "coverage_end": [
        "coverage_end", "term_date", "termination_date", "end_date",
        "eligibility_end", "disenrollment_date", "coverage_termination_date",
        "member_term_date", "term_dt", "termination_dt",
        "enrollment_end", "coverage_end_date", "benefit_end_date",
    ],
    "group_number": [
        "group_number", "group_no", "group_id", "employer_group",
        "group_nbr", "group_num", "grp_number", "grp_id",
    ],
    "contract_id": [
        "contract_id", "contract_number", "contract_no", "h_number",
        "contract_nbr", "plan_contract_id",
    ],

    # -----------------------------------------------------------------------
    # PCP / Attribution
    # -----------------------------------------------------------------------
    "pcp_npi": [
        "pcp_npi", "pcp_provider_npi", "primary_care_npi",
        "assigned_pcp_npi", "pcp_national_provider_id", "attributed_npi",
    ],
    "pcp_name": [
        "pcp_name", "pcp_provider_name", "primary_care_provider",
        "assigned_pcp", "attributed_provider", "pcp_physician_name",
    ],

    # -----------------------------------------------------------------------
    # Member status flags
    # -----------------------------------------------------------------------
    "medicaid_status": [
        "medicaid_status", "medicaid", "dual_eligible", "dual",
        "medicaid_flag", "dual_status", "medicaid_eligible",
        "dsnp", "full_dual", "partial_dual", "dual_indicator",
    ],
    "disability_status": [
        "disability_status", "disability", "disabled",
        "originally_disabled", "esrd", "disability_flag",
        "originally_entitled_by_disability", "orec",
    ],
    "institutional": [
        "institutional", "institution", "ltc", "snf_resident",
        "institutional_flag", "long_term_care", "institutional_status",
    ],

    # -----------------------------------------------------------------------
    # Claim identifiers
    # -----------------------------------------------------------------------
    "claim_id": [
        "claim_id", "claimid", "claim_number", "claim_no",
        "claim_nbr", "claim_num", "clm_id", "claim_reference",
        "claim_control_number", "dcn", "icn", "tcn",
        "transaction_control_number", "internal_claim_number",
    ],
    "claim_type": [
        "claim_type", "claimtype", "type_of_claim", "form_type",
        "claim_form_type", "bill_type", "claim_category", "clm_type",
        "claim_source",
    ],
    "claim_status": [
        "claim_status", "status", "adjudication_status", "claim_disposition",
        "processing_status",
    ],

    # -----------------------------------------------------------------------
    # Service dates
    # -----------------------------------------------------------------------
    "service_date": [
        "service_date", "date_of_service", "dos", "from_date",
        "service_from_date", "svc_date", "fill_date", "dispensed_date",
        "svc_dt", "service_dt", "from_dos", "begin_date",
        "service_begin_date", "dos_from", "date_service",
        "claim_date", "service_start_date",
    ],
    "service_end_date": [
        "service_end_date", "to_date", "service_to_date", "thru_date",
        "through_date", "dos_to", "service_through_date", "end_dos",
    ],
    "paid_date": [
        "paid_date", "payment_date", "check_date", "adjudication_date",
        "processed_date", "paid_dt", "payment_dt", "remit_date",
        "eob_date", "finalized_date",
    ],
    "admission_date": [
        "admission_date", "admit_date", "admit_dt", "admission_dt",
        "admitted_date", "date_admitted", "admit",
    ],
    "discharge_date": [
        "discharge_date", "discharge_dt", "disch_date", "disch_dt",
        "discharged_date", "date_discharged", "discharge",
    ],

    # -----------------------------------------------------------------------
    # Diagnosis codes
    # -----------------------------------------------------------------------
    "diagnosis_codes": [
        "diagnosis_codes", "diagnosis", "diag", "dx", "icd10",
        "icd_code", "dx_code", "primary_diagnosis", "diag_code",
        "diagnosis_code", "icd10_code", "icd_10_code",
    ],
    "diagnosis_1": [
        "diagnosis_1", "diag_1", "diag1", "dx1", "dx_1",
        "principal_dx", "principal_diagnosis",
        "icd10_1", "icd_1", "admit_diagnosis", "admitting_diagnosis",
        "diag_cd_1", "diagnosis_code_1", "dx_cd_1", "primary_dx",
    ],
    "diagnosis_2": [
        "diagnosis_2", "diag_2", "diag2", "dx2", "dx_2",
        "secondary_diagnosis", "icd10_2", "icd_2",
        "diag_cd_2", "diagnosis_code_2", "dx_cd_2",
    ],
    "diagnosis_3": [
        "diagnosis_3", "diag_3", "diag3", "dx3", "dx_3",
        "icd10_3", "icd_3", "diag_cd_3", "diagnosis_code_3", "dx_cd_3",
    ],
    "diagnosis_4": [
        "diagnosis_4", "diag_4", "diag4", "dx4", "dx_4",
        "icd10_4", "icd_4", "diag_cd_4", "diagnosis_code_4", "dx_cd_4",
    ],
    "diagnosis_5": [
        "diagnosis_5", "diag_5", "diag5", "dx5", "dx_5",
        "icd10_5", "icd_5", "diag_cd_5", "diagnosis_code_5", "dx_cd_5",
    ],
    "diagnosis_6": [
        "diagnosis_6", "diag_6", "diag6", "dx6", "dx_6",
        "icd10_6", "icd_6", "diag_cd_6", "diagnosis_code_6", "dx_cd_6",
    ],
    "diagnosis_7": [
        "diagnosis_7", "diag_7", "diag7", "dx7", "dx_7",
        "icd10_7", "icd_7", "diag_cd_7", "diagnosis_code_7", "dx_cd_7",
    ],
    "diagnosis_8": [
        "diagnosis_8", "diag_8", "diag8", "dx8", "dx_8",
        "icd10_8", "icd_8", "diag_cd_8", "diagnosis_code_8", "dx_cd_8",
    ],
    "diagnosis_9": [
        "diagnosis_9", "diag_9", "diag9", "dx9", "dx_9",
        "icd10_9", "icd_9", "diag_cd_9", "diagnosis_code_9", "dx_cd_9",
    ],
    "diagnosis_10": [
        "diagnosis_10", "diag_10", "diag10", "dx10", "dx_10",
        "icd10_10", "icd_10", "diag_cd_10", "diagnosis_code_10", "dx_cd_10",
    ],
    "diagnosis_11": [
        "diagnosis_11", "diag_11", "diag11", "dx11", "dx_11",
    ],
    "diagnosis_12": [
        "diagnosis_12", "diag_12", "diag12", "dx12", "dx_12",
    ],

    # -----------------------------------------------------------------------
    # Procedure / service codes
    # -----------------------------------------------------------------------
    "procedure_code": [
        "procedure_code", "cpt", "cpt_code", "hcpcs", "hcpcs_code",
        "proc_code", "procedure", "cpt_hcpcs", "service_code",
        "procedure_cd", "hcpcs_cd", "cpt_cd", "proc_cd",
        "surgical_procedure", "principal_procedure",
    ],
    "drg_code": [
        "drg_code", "drg", "ms_drg", "apr_drg", "drg_number",
        "drg_cd", "ms_drg_code", "diagnostic_related_group",
    ],
    "revenue_code": [
        "revenue_code", "rev_code", "revenue", "rev_cd",
        "revenue_cd", "ub_revenue_code",
    ],
    "modifier_1": [
        "modifier_1", "mod_1", "mod1", "modifier", "procedure_modifier",
        "cpt_modifier", "hcpcs_modifier", "modifier_cd_1",
    ],
    "modifier_2": [
        "modifier_2", "mod_2", "mod2", "modifier_cd_2",
    ],
    "modifier_3": [
        "modifier_3", "mod_3", "mod3", "modifier_cd_3",
    ],
    "modifier_4": [
        "modifier_4", "mod_4", "mod4", "modifier_cd_4",
    ],
    "pos_code": [
        "pos_code", "pos", "place_of_service", "place_of_svc",
        "pos_cd", "service_location", "place_of_service_code",
    ],
    "ndc_code": [
        "ndc_code", "ndc", "ndc_number", "national_drug_code",
        "ndc_cd", "drug_code", "ndc_11", "ndc_9",
    ],

    # -----------------------------------------------------------------------
    # Financial amounts
    # -----------------------------------------------------------------------
    "billed_amount": [
        "billed_amount", "billed", "charge_amount", "total_charge",
        "charges", "billed_charges", "billed_amt", "charge_amt",
        "total_charges", "gross_amount", "submitted_amount",
        "submitted_charges", "line_charge", "total_billed",
    ],
    "allowed_amount": [
        "allowed_amount", "allowed", "eligible_amount", "approved_amount",
        "allowed_amt", "eligible_amt", "allowable_amount",
        "contracted_amount", "negotiated_amount",
    ],
    "paid_amount": [
        "paid_amount", "paid", "payment_amount", "net_paid",
        "plan_paid", "amount_paid", "total_paid", "paid_amt",
        "net_payment", "plan_payment", "reimbursement_amount",
        "check_amount", "payment_amt",
    ],
    "member_liability": [
        "member_liability", "patient_liability", "copay", "coinsurance",
        "deductible", "member_cost", "member_responsibility",
        "patient_responsibility", "member_oop", "out_of_pocket",
        "cost_share", "patient_pay", "member_pay",
    ],
    "copay_amount": [
        "copay_amount", "copay_amt", "co_pay",
    ],
    "coinsurance_amount": [
        "coinsurance_amount", "coinsurance", "coinsurance_amt", "co_insurance",
    ],
    "deductible_amount": [
        "deductible_amount", "deductible", "deductible_amt", "ded_amount",
    ],

    # -----------------------------------------------------------------------
    # Provider fields
    # -----------------------------------------------------------------------
    "npi": [
        "npi", "provider_npi", "national_provider_identifier",
        "provider_id", "npi_number", "provider_number",
    ],
    "rendering_npi": [
        "rendering_npi", "rendering_provider_npi", "servicing_npi",
        "attending_npi", "performing_npi", "rendering_provider_id",
    ],
    "rendering_provider_name": [
        "rendering_provider_name", "rendering_provider", "servicing_provider",
        "provider_name", "attending_physician", "performing_provider",
        "rendering_name", "servicing_provider_name",
    ],
    "billing_npi": [
        "billing_npi", "billing_provider_npi", "billing_provider_id",
    ],
    "billing_provider_name": [
        "billing_provider_name", "billing_provider", "billing_name",
    ],
    "referring_npi": [
        "referring_npi", "referring_provider_npi", "referral_npi",
    ],
    "facility_name": [
        "facility_name", "facility", "hospital_name", "location_name",
        "servicing_facility", "facility_nm", "hospital", "institution_name",
        "service_facility", "place_of_service_name",
    ],
    "facility_npi": [
        "facility_npi", "facility_provider_npi", "hospital_npi",
        "service_facility_npi",
    ],
    "specialty": [
        "specialty", "provider_specialty", "speciality",
        "provider_type", "specialty_code", "specialty_description",
        "physician_specialty",
    ],
    "practice_name": [
        "practice_name", "practice", "group_name", "clinic_name",
        "organization_name", "medical_group", "practice_group",
        "group_practice",
    ],
    "tin": [
        "tin", "tax_id", "tax_identification_number", "ein", "fein",
        "federal_tax_id", "tax_id_number", "employer_id",
    ],
    "taxonomy_code": [
        "taxonomy_code", "taxonomy", "provider_taxonomy",
        "taxonomy_cd", "provider_taxonomy_code",
    ],
    "credentialing_status": [
        "credentialing_status", "credential_status", "credentialed",
        "credentialing",
    ],
    "panel_status": [
        "panel_status", "panel_open", "panel",
    ],
    "accepting_new_patients": [
        "accepting_new_patients", "accepting_patients", "open_panel",
        "new_patients",
    ],

    # -----------------------------------------------------------------------
    # Pharmacy / Drug fields
    # -----------------------------------------------------------------------
    "drug_name": [
        "drug_name", "drug", "medication", "med_name", "product_name",
        "brand_name", "generic_name", "medication_name", "rx_name",
        "drug_description", "drug_label_name",
    ],
    "drug_class": [
        "drug_class", "therapeutic_class", "ahfs", "gpi",
        "pharmacological_class", "drug_category", "ahfs_code",
        "gpi_code", "therapeutic_category",
    ],
    "quantity": [
        "quantity", "qty", "quantity_dispensed", "units",
        "qty_dispensed", "metric_quantity", "quantity_supplied",
    ],
    "days_supply": [
        "days_supply", "supply_days", "days", "day_supply",
        "days_supplied", "supply",
    ],
    "pharmacy_name": [
        "pharmacy_name", "pharmacy", "dispensing_pharmacy",
        "pharmacy_nm", "filling_pharmacy",
    ],
    "pharmacy_npi": [
        "pharmacy_npi", "dispensing_pharmacy_npi", "pharmacy_provider_npi",
    ],
    "prescriber_npi": [
        "prescriber_npi", "prescriber_id",
        "prescribing_npi", "prescriber_provider_npi",
    ],
    "prescriber_name": [
        "prescriber_name", "prescriber", "ordering_provider",
        "prescribing_provider", "prescriber_provider_name",
    ],
    "daw_code": [
        "daw_code", "daw", "dispense_as_written", "daw_cd",
    ],
    "formulary_status": [
        "formulary_status", "formulary", "formulary_tier",
        "formulary_indicator",
    ],
    "generic_indicator": [
        "generic_indicator", "generic_flag", "brand_generic",
        "multi_source", "brand_or_generic", "generic",
    ],
    "refill_number": [
        "refill_number", "refill", "refill_no", "refill_nbr",
        "number_of_refills",
    ],

    # -----------------------------------------------------------------------
    # Discharge / admit
    # -----------------------------------------------------------------------
    "discharge_status": [
        "discharge_status", "discharge_disposition", "disch_status",
        "patient_status", "patient_disposition", "discharge_status_code",
        "discharge_code", "patient_status_code",
    ],
    "admit_type": [
        "admit_type", "admission_type", "type_of_admission",
        "admit_type_code", "admission_type_code",
    ],
    "admit_source": [
        "admit_source", "admission_source", "source_of_admission",
        "admit_source_code", "admission_source_code",
    ],

    # -----------------------------------------------------------------------
    # Authorization / Prior Auth
    # -----------------------------------------------------------------------
    "auth_id": [
        "auth_id", "authorization_id", "auth_number", "prior_auth_number",
        "authorization_number", "auth_nbr", "pa_number",
    ],
    "service_type": [
        "service_type", "auth_service_type", "service_category",
        "type_of_service",
    ],
    "requesting_provider_npi": [
        "requesting_provider_npi", "requesting_npi",
    ],
    "servicing_provider_npi": [
        "servicing_provider_npi", "servicing_npi",
    ],
    "requested_date": [
        "requested_date", "request_date", "submission_date",
        "auth_request_date",
    ],
    "decision_date": [
        "decision_date", "determination_date", "review_date",
        "auth_decision_date",
    ],
    "decision": [
        "decision", "determination", "auth_decision", "auth_status",
        "authorization_status",
    ],
    "approved_units": [
        "approved_units", "approved_qty", "authorized_units",
        "approved_quantity",
    ],
    "approved_from_date": [
        "approved_from_date", "auth_start_date", "authorized_from",
        "auth_effective_date",
    ],
    "approved_to_date": [
        "approved_to_date", "auth_end_date", "authorized_to",
        "auth_termination_date",
    ],
    "denial_reason": [
        "denial_reason", "deny_reason", "denial_code",
        "denial_reason_code",
    ],
    "urgency": [
        "urgency", "urgent_flag", "review_urgency", "expedited",
        "priority",
    ],

    # -----------------------------------------------------------------------
    # Lab results
    # -----------------------------------------------------------------------
    "order_date": [
        "order_date", "ordered_date", "lab_order_date", "order_dt",
    ],
    "result_date": [
        "result_date", "resulted_date", "lab_result_date", "report_date",
        "result_dt",
    ],
    "test_code": [
        "test_code", "loinc", "loinc_code", "lab_code", "order_code",
        "loinc_cd", "test_cd",
    ],
    "test_name": [
        "test_name", "lab_test", "test_description", "order_name",
        "lab_test_name", "test_desc",
    ],
    "result_value": [
        "result_value", "result", "value", "lab_value",
        "observation_value", "test_result",
    ],
    "result_units": [
        "result_units", "unit_of_measure", "uom",
        "lab_units", "result_unit",
    ],
    "reference_range": [
        "reference_range", "ref_range", "normal_range",
        "reference_interval",
    ],
    "abnormal_flag": [
        "abnormal_flag", "abnormal", "flag", "interpretation",
        "abnormal_indicator",
    ],
    "ordering_provider_npi": [
        "ordering_provider_npi", "ordering_npi", "ordering_provider",
        "ordering_physician_npi",
    ],
    "performing_lab": [
        "performing_lab", "lab_name", "performing_organization",
        "laboratory_name",
    ],

    # -----------------------------------------------------------------------
    # Capitation
    # -----------------------------------------------------------------------
    "cap_amount": [
        "cap_amount", "capitation_amount", "pmpm_amount", "cap_rate",
        "capitation_rate", "pmpm",
    ],
    "payment_month": [
        "payment_month", "cap_month", "period", "payment_period",
        "service_month", "cap_period",
    ],
    "rate_cell": [
        "rate_cell", "rate_category", "age_sex_cell", "rate_code",
    ],

    # -----------------------------------------------------------------------
    # Risk scores / HCC
    # -----------------------------------------------------------------------
    "raf_score": [
        "raf_score", "raf", "risk_score", "hcc_score",
        "risk_adjustment_factor", "total_raf", "cms_raf",
        "risk_adjustment_score",
    ],
    "hcc_list": [
        "hcc_list", "hcc_codes", "active_hccs", "hcc_conditions",
        "hcc", "hierarchical_condition_categories",
    ],
    "payment_year": [
        "payment_year", "model_year", "dos_year", "py",
        "risk_score_year",
    ],
    "demographic_score": [
        "demographic_score", "demo_score", "demographic_raf",
        "age_sex_score",
    ],
    "disease_score": [
        "disease_score", "disease_raf", "condition_score",
        "hcc_disease_score",
    ],
    "model_version": [
        "model_version", "hcc_model", "cms_model", "risk_model",
    ],

    # -----------------------------------------------------------------------
    # Encounter
    # -----------------------------------------------------------------------
    "encounter_id": [
        "encounter_id", "visit_id", "encounter_number", "enc_id",
        "visit_number",
    ],
    "encounter_date": [
        "encounter_date", "visit_date", "appointment_date", "enc_date",
    ],
    "encounter_type": [
        "encounter_type", "visit_type", "appointment_type", "enc_type",
    ],

    # -----------------------------------------------------------------------
    # Care gap / Quality
    # -----------------------------------------------------------------------
    "measure_code": [
        "measure_code", "hedis_measure", "quality_measure",
        "measure_id", "gap_measure",
    ],
    "measure_name": [
        "measure_name", "measure_description", "quality_measure_name",
    ],
    "gap_status": [
        "gap_status", "open_gap", "closed_gap", "gap_in_care",
        "compliance_status",
    ],
    "due_date": [
        "due_date", "gap_due_date", "next_due_date", "compliance_date",
    ],
    "last_service_date": [
        "last_service_date", "last_completed_date",
        "gap_closed_date",
    ],
    "stars_weight": [
        "stars_weight", "star_weight", "measure_weight", "weight",
    ],
    "numerator": [
        "numerator", "num", "numerator_flag", "compliant",
    ],
    "denominator": [
        "denominator", "denom", "denominator_flag", "eligible",
    ],
    "performance_year": [
        "performance_year", "measurement_year", "reporting_year",
    ],

    # -----------------------------------------------------------------------
    # ADT / Census
    # -----------------------------------------------------------------------
    "patient_class": [
        "patient_class", "patient_type", "visit_class",
        "accommodation_code",
    ],
    "attending_provider": [
        "attending_provider", "attending_physician", "attending_md",
        "attending_npi",
    ],
    "room_bed": [
        "room_bed", "room", "bed", "room_number", "bed_number",
    ],
    "event_type": [
        "event_type", "adt_event", "message_type", "trigger_event",
    ],
}


# ---------------------------------------------------------------------------
# Reverse lookup: alias (normalized) -> canonical field name
# ---------------------------------------------------------------------------

def build_reverse_alias_map() -> dict[str, str]:
    """
    Build a reverse mapping from every known alias to its canonical field name.
    All keys are lowercase with spaces/hyphens/dots replaced by underscores.
    """
    reverse: dict[str, str] = {}
    for canonical, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            normalized = alias.strip().lower().replace(" ", "_").replace("-", "_").replace(".", "_")
            # First alias wins if there is a collision
            if normalized not in reverse:
                reverse[normalized] = canonical
    return reverse


def _validate_no_cross_field_collisions() -> None:
    """
    Check for aliases that appear under multiple canonical fields.
    Logs a warning at import time if any collisions are found.
    This helps catch maintenance errors in the alias table.
    """
    import logging as _logging
    _logger = _logging.getLogger(__name__)

    alias_to_fields: dict[str, list[str]] = {}
    for canonical, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            normalized = alias.strip().lower().replace(" ", "_").replace("-", "_").replace(".", "_")
            if normalized not in alias_to_fields:
                alias_to_fields[normalized] = []
            alias_to_fields[normalized].append(canonical)

    collisions = {
        alias: fields
        for alias, fields in alias_to_fields.items()
        if len(fields) > 1
    }
    if collisions:
        for alias, fields in collisions.items():
            _logger.warning(
                "Alias collision: '%s' appears under multiple canonical fields: %s. "
                "Only the first (%s) will be used in reverse lookups.",
                alias, fields, fields[0],
            )


# Validate at module load time
_validate_no_cross_field_collisions()

# Pre-built at import time for fast lookups
REVERSE_ALIAS_MAP: dict[str, str] = build_reverse_alias_map()
