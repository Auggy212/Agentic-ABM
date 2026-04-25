const Ajv = require("ajv");
const schema = require("./master-context.schema.json");

const ajv = new Ajv({
  allErrors: true,
  strict: false
});

const validate = ajv.compile(schema);

function toReadableError(error) {
  const path = error.instancePath && error.instancePath.length > 0 ? error.instancePath : "/";
  if (error.keyword === "required" && error.params && error.params.missingProperty) {
    return `${path}: missing required field '${error.params.missingProperty}'`;
  }
  if (error.keyword === "additionalProperties" && error.params && error.params.additionalProperty) {
    return `${path}: unknown field '${error.params.additionalProperty}' is not allowed`;
  }
  return `${path}: ${error.message}`;
}

function addRangeErrorIfInvalid(errors, path, rangeObj) {
  if (
    rangeObj &&
    typeof rangeObj.min === "number" &&
    typeof rangeObj.max === "number" &&
    rangeObj.min > rangeObj.max
  ) {
    errors.push(`${path}: 'min' cannot be greater than 'max'`);
  }
}

function validateMasterContext(input) {
  const valid = validate(input);
  if (!valid) {
    return {
      valid: false,
      errors: (validate.errors || []).map(toReadableError)
    };
  }

  const semanticErrors = [];
  addRangeErrorIfInvalid(semanticErrors, "/company/acv_range", input.company && input.company.acv_range);
  addRangeErrorIfInvalid(
    semanticErrors,
    "/icp/company_size_by_employees",
    input.icp && input.icp.company_size_by_employees
  );
  addRangeErrorIfInvalid(
    semanticErrors,
    "/icp/company_size_by_arr",
    input.icp && input.icp.company_size_by_arr
  );
  addRangeErrorIfInvalid(
    semanticErrors,
    "/buyers/buying_committee_size",
    input.buyers && input.buyers.buying_committee_size
  );

  if (semanticErrors.length > 0) {
    return {
      valid: false,
      errors: semanticErrors
    };
  }

  return { valid: true };
}

module.exports = {
  validateMasterContext
};

