interface Props {
  courseRows: {
    coursecode: string;
    coursename: string;
    rowspan: number;
    lecturers: { lecturercode: string; lecturername: string }[];
  }[];
}

export default function CourseTable({ courseRows }: Props) {
  return (
    <table className="detail-table">
      <thead>
        <tr>
          <th>Course Code</th>
          <th>Course Name</th>
          <th>Lecturer Code</th>
          <th>Lecturer Name</th>
        </tr>
      </thead>
      <tbody>
        {courseRows.map((item) => (
          item.lecturers.map((lecturer, idx) => (
            <tr key={`${item.coursecode}-${idx}`}>
              {idx === 0 && (
                <>
                  <td rowSpan={item.rowspan}>{item.coursecode}</td>
                  <td rowSpan={item.rowspan}>{item.coursename}</td>
                </>
              )}
              <td>{lecturer.lecturercode}</td>
              <td>{lecturer.lecturername}</td>
            </tr>
          ))
        ))}
      </tbody>
    </table>
  );
}