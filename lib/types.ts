export type ContextLabel = 'box' | 'passage' | 'condition' | 'data' | 'example';

export interface ExamData {
  title: string;
  questions: Question[];
}

export interface Question {
  number: number;
  text: string;
  boxContext: string[];
  contextLabel?: ContextLabel;
  needsFigure: boolean;
  options: string[];
}

export interface GeminiResponseSchema {
  type: 'object';
  properties: {
    title: { type: 'string'; description: string };
    questions: {
      type: 'array';
      items: {
        type: 'object';
        properties: {
          number: { type: 'number'; description: string };
          text: { type: 'string'; description: string };
          boxContext: {
            type: 'array';
            items: { type: 'string' };
            description: string;
          };
          contextLabel: {
            type: 'string';
            description: string;
          };
          needsFigure: {
            type: 'boolean';
            description: string;
          };
          options: {
            type: 'array';
            items: { type: 'string' };
            description: string;
          };
        };
        required: ['number', 'text', 'boxContext', 'needsFigure', 'options'];
      };
    };
  };
  required: ['title', 'questions'];
}

export interface HwpxBuildConfig {
  templatePath: string;
  examData: ExamData;
  outputPath: string;
}

export interface ProcessResult {
  success: boolean;
  hwpxData?: string;
  error?: string;
}
