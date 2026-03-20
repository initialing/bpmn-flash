export abstract class WorkflowError extends Error {
  public readonly code: string;
  public readonly timestamp: Date;
  public readonly details?: any;

  constructor(message: string, code: string, details?: any) {
    super(message);
    this.code = code;
    this.timestamp = new Date();
    this.details = details;
    Object.setPrototypeOf(this, WorkflowError.prototype);
  }
}

export class ParseError extends WorkflowError {
  constructor(message: string, details?: any) {
    super(message, 'PARSE_ERROR', details);
    Object.setPrototypeOf(this, ParseError.prototype);
  }
}

export class ValidationError extends WorkflowError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', details);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class ExecutionError extends WorkflowError {
  constructor(message: string, details?: any) {
    super(message, 'EXECUTION_ERROR', details);
    Object.setPrototypeOf(this, ExecutionError.prototype);
  }
}

export class ConfigurationError extends WorkflowError {
  constructor(message: string, details?: any) {
    super(message, 'CONFIGURATION_ERROR', details);
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }
}

export class VariableEvaluationError extends WorkflowError {
  constructor(message: string, details?: any) {
    super(message, 'VARIABLE_EVALUATION_ERROR', details);
    Object.setPrototypeOf(this, VariableEvaluationError.prototype);
  }
}