CREATE TABLE agency (
  agencyid TEXT PRIMARY KEY,
  agencyname TEXT NOT NULL
);

CREATE TABLE session (
  sessioncode TEXT PRIMARY KEY,
  session_name TEXT NOT NULL,
  agencyid TEXT NOT NULL REFERENCES agency(agencyid)
);

CREATE TABLE department (
  departmentcode TEXT PRIMARY KEY,
  departmentname TEXT NOT NULL,
  agencyid TEXT NOT NULL REFERENCES agency(agencyid)
);

CREATE TABLE class (
  classcode TEXT PRIMARY KEY,
  departmentcode TEXT NOT NULL REFERENCES department(departmentcode),
  agencyid TEXT NOT NULL REFERENCES agency(agencyid)
);

CREATE TABLE course (
  coursecode TEXT PRIMARY KEY,
  coursename TEXT NOT NULL
);

CREATE TABLE lecturer (
  lecturercode TEXT PRIMARY KEY,
  lecturername TEXT NOT NULL
);

CREATE TABLE lab (
  labname TEXT PRIMARY KEY
);

CREATE TABLE timetable (
  ttid TEXT NOT NULL,
  coursecode TEXT NOT NULL REFERENCES course(coursecode),
  lecturercode TEXT NOT NULL REFERENCES lecturer(lecturercode),
  labname TEXT NOT NULL REFERENCES lab(labname),
  classcode TEXT NOT NULL REFERENCES class(classcode),
  sessioncode TEXT NOT NULL REFERENCES session(sessioncode),
  agencyid TEXT NOT NULL REFERENCES agency(agencyid),
  PRIMARY KEY (ttid, coursecode, lecturercode, labname, classcode, sessioncode, agencyid)
);
