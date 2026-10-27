import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

export interface Student {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  course: string;
  enrollmentDate: string;
}

@Component({
  selector: 'app-root',
  imports: [FormsModule, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'Student Registration';

  student: Omit<Student, 'id'> = {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    course: '',
    enrollmentDate: ''
  };

  students: Student[] = [];
  private nextId = 1;

  courses = [
    'Computer Science',
    'Business Administration',
    'Mechanical Engineering',
    'Psychology',
    'Graphic Design'
  ];

  onSubmit(): void {
    if (!this.student.firstName || !this.student.lastName || !this.student.email) {
      return;
    }

    this.students = [
      ...this.students,
      {
        id: this.nextId++,
        ...this.student
      }
    ];

    this.resetForm();
  }

  resetForm(): void {
    this.student = {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      course: '',
      enrollmentDate: ''
    };
  }

  deleteStudent(id: number): void {
    this.students = this.students.filter((s) => s.id !== id);
  }
}
