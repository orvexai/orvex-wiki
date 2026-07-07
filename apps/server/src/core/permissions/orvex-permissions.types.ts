export type OrvexAction = 'read' | 'edit';

export type OrvexEvalSubject = {
  subject: 'Page';
  id: string;
};

export type OrvexEvalResult = {
  subject: 'Page';
  id: string;
  actions: OrvexAction[];
};
