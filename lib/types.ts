export interface Agency {
  agencyid: string;
  agencyname: string;
  sessions: Session[];
}

export interface Session {
  sessioncode: string;
  session_name: string;
}

export interface TimetableEntry {
  ttid: string;
  coursecode: string;
  classcode: string;
  labname: string;
  lecturers: Lecturer[];
  coursename?: string;
  shortcode?: string;
  classcodes?: string[];  // Multiple classes when merged (same course+lab)
}

export interface Lecturer {
  code: string;
  name: string;
}

export interface Course {
  coursecode: string;
  coursename: string;
}

export interface TimetableData {
  agency: Agency;
  session: Session;
  courses: Record<string, Course>;
  classes: string[];
  labs: string[];
  lecturers: string[];
  timetables: TimetableEntry[];
}

export interface GridCell {
  hour: string;
  label: string;
  items: TimetableEntry[];
  span: number;
}

export interface GridRow {
  day_code: string;
  day_name: string;
  cells: GridCell[];
}

export interface CourseRow {
  coursecode: string;
  coursename: string;
  shortcode: string;
  rowspan: number;
  lecturers: { lecturercode: string; lecturername: string }[];
}

export const DAY_ORDER: [string, string][] = [
  ['01', 'Sunday'],
  ['02', 'Monday'],
  ['03', 'Tuesday'],
  ['04', 'Wednesday'],
  ['05', 'Thursday'],
  ['06', 'Friday'],
  ['07', 'Saturday'],
];

export const TIME_ORDER = ['08', '09', '10', '11', '12', '13', '14', '15', '16', '17'];

export const TIME_LABELS: Record<string, string> = {
  '08': '8:00 - 9:00',
  '09': '9:00 - 10:00',
  '10': '10:00 - 11:00',
  '11': '11:00 - 12:00',
  '12': '12:00 - 13:00',
  '13': '13:00 - 14:00',
  '14': '14:00 - 15:00',
  '15': '15:00 - 16:00',
  '16': '16:00 - 17:00',
  '17': '17:00 - 18:00',
};
