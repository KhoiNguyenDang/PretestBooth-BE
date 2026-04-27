import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.MAIL_PORT || '587'),
      secure: process.env.MAIL_SECURE === 'true',
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });
  }

  async sendVerificationEmail(email: string, verificationToken: string): Promise<void> {
    const verificationUrl = `${process.env.APP_URL}/verify-email?token=${verificationToken}`;

    const mailOptions = {
      from: process.env.MAIL_FROM || process.env.MAIL_USER,
      to: email,
      subject: 'Email Verification - Pretest Booth',
      html: `
        <h1>Email Verification</h1>
        <p>Thank you for signing up! Please verify your email address by clicking the link below:</p>
        <p><a href="${verificationUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verify Email</a></p>
        <p>Or copy and paste this link in your browser:</p>
        <p>${verificationUrl}</p>
        <p>This link will expire in 24 hours.</p>
        <p>If you didn't sign up for this account, please ignore this email.</p>
      `,
    };

    await this.transporter.sendMail(mailOptions);
  }

  async sendPasswordResetEmail(email: string, resetCode: string): Promise<void> {
    const mailOptions = {
      from: process.env.MAIL_FROM || process.env.MAIL_USER,
      to: email,
      subject: 'Đặt lại mật khẩu - Pretest Booth',
      html: `
        <h1>Đặt lại mật khẩu</h1>
        <p>Mã đặt lại mật khẩu của bạn là:</p>
        <p style="font-size: 24px; font-weight: bold;">${resetCode}</p>
        <p>Mã có hiệu lực trong 5 phút. Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.</p>
      `,
    };

    await this.transporter.sendMail(mailOptions);
  }

  async sendStudentAccountCredentialsEmail(params: {
    email: string;
    name?: string | null;
    studentCode?: string | null;
    password: string;
  }): Promise<void> {
    const loginUrl = `${process.env.APP_URL || 'http://localhost:3000'}/login`;
    const displayName = params.name?.trim() || params.studentCode || 'Sinh viên';

    const mailOptions = {
      from: process.env.MAIL_FROM || process.env.MAIL_USER,
      to: params.email,
      subject: 'Thong tin tai khoan sinh vien - Pretest Booth',
      html: `
        <h1>Thong tin tai khoan Pretest Booth</h1>
        <p>Xin chao ${displayName},</p>
        <p>Tai khoan sinh vien cua ban da duoc tao boi quan tri vien.</p>
        <p><strong>Email dang nhap:</strong> ${params.email}</p>
        <p><strong>Mat khau tam thoi:</strong> ${params.password}</p>
        <p>Vui long dang nhap tai: <a href="${loginUrl}">${loginUrl}</a></p>
        <p>Neu ban khong nhan duoc yeu cau nay, vui long lien he quan tri vien.</p>
      `,
    };

    await this.transporter.sendMail(mailOptions);
  }

  async sendExamResultPublishedEmail(params: {
    email: string;
    studentName?: string | null;
    examTitle: string;
    score: number;
    maxScore: number | null;
    sessionId: string;
  }): Promise<void> {
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const detailUrl = `${appUrl}/submissions/exam/${params.sessionId}`;
    const scoreText =
      params.maxScore && params.maxScore > 0
        ? `${params.score}/${params.maxScore}`
        : `${params.score}`;
    const displayName = params.studentName?.trim() || 'Sinh viên';

    await this.transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.MAIL_USER,
      to: params.email,
      subject: 'Ket qua bai thi da duoc cong bo - Pretest Booth',
      html: `
        <h2>Ket qua bai thi da duoc cong bo</h2>
        <p>Xin chao ${displayName},</p>
        <p>Ket qua bai thi <strong>${params.examTitle}</strong> da duoc cong bo.</p>
        <p><strong>Diem hien tai:</strong> ${scoreText}</p>
        <p>Ban co the xem chi tiet tai: <a href="${detailUrl}">${detailUrl}</a></p>
      `,
    });
  }

  async sendExamResultUpdatedEmail(params: {
    email: string;
    studentName?: string | null;
    examTitle: string;
    score: number;
    maxScore: number | null;
    sessionId: string;
  }): Promise<void> {
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const detailUrl = `${appUrl}/submissions/exam/${params.sessionId}`;
    const scoreText =
      params.maxScore && params.maxScore > 0
        ? `${params.score}/${params.maxScore}`
        : `${params.score}`;
    const displayName = params.studentName?.trim() || 'Sinh viên';

    await this.transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.MAIL_USER,
      to: params.email,
      subject: 'Ket qua bai thi da duoc cap nhat - Pretest Booth',
      html: `
        <h2>Ket qua bai thi da duoc cap nhat</h2>
        <p>Xin chao ${displayName},</p>
        <p>Diem bai thi <strong>${params.examTitle}</strong> cua ban da duoc dieu chinh boi giang vien.</p>
        <p><strong>Diem moi:</strong> ${scoreText}</p>
        <p>Ban co the xem chi tiet tai: <a href="${detailUrl}">${detailUrl}</a></p>
      `,
    });
  }

  async sendBoothTransferConflictEmail(params: {
    email: string;
    studentName?: string | null;
    studentCode?: string | null;
    sourceBoothName: string;
    sourceBoothCode?: string | null;
    targetBoothName: string;
    targetBoothCode?: string | null;
    reason: string;
    bookingWindow: string;
    conflictReason: string;
  }): Promise<void> {
    const displayName = params.studentName?.trim() || params.studentCode || 'Sinh vien';
    const sourceBoothLabel = `${params.sourceBoothName}${params.sourceBoothCode ? ` (${params.sourceBoothCode})` : ''}`;
    const targetBoothLabel = `${params.targetBoothName}${params.targetBoothCode ? ` (${params.targetBoothCode})` : ''}`;

    await this.transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.MAIL_USER,
      to: params.email,
      subject: 'Thong bao dieu phoi booth that bai - Pretest Booth',
      html: `
        <h2>Thong bao dieu phoi lich booth</h2>
        <p>Xin chao ${displayName},</p>
        <p>He thong da thu dieu phoi lich cua ban tu booth <strong>${sourceBoothLabel}</strong> sang <strong>${targetBoothLabel}</strong> do su co.</p>
        <p><strong>Khung gio booking:</strong> ${params.bookingWindow}</p>
        <p><strong>Ly do dieu phoi:</strong> ${params.reason}</p>
        <p><strong>Ket qua:</strong> Khong the chuyen booth do trung lich (${params.conflictReason}).</p>
        <p>Vui long theo doi thong bao tiep theo hoac lien he quan tri vien/giam thi de duoc ho tro.</p>
      `,
    });
  }
}
