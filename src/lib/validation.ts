import { z } from "zod";
import { recordTypeEnum, sensitivityEnum, textLayerEnum } from "@/db/schema";

const optStr = (max = 500) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));
const optDate = z.string().trim().optional().transform((v) => (v ? v : undefined)).refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use YYYY-MM-DD");

export const recordInput = z.object({
  title: z.string().trim().min(3, "Title is required").max(500),
  recordType: z.enum(recordTypeEnum.enumValues),
  documentNumber: optStr(120),
  description: optStr(5000),
  classificationId: z.string().trim().min(1, "Classification is required"),
  officeId: z.string().trim().min(1, "Office/origin is required"),
  dateCreated: optDate,
  dateReceived: optDate,
  sensitivity: z.enum(sensitivityEnum.enumValues).optional(),
  containsPii: z.boolean().optional(),
  redactionRequired: z.boolean().optional(),
  legalHold: z.boolean().optional(),
  physicalLocation: optStr(300),
  keywords: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  language: z.string().trim().max(20).default("eng"),
  sourceFormat: z.enum(["paper_scan", "born_digital", "harvested"]).default("born_digital"),
  textLayer: z.enum(textLayerEnum.enumValues).default("unknown"),
  metadata: z.record(z.string(), z.string().max(500)).default({}),
  relatedRecordNos: z.array(z.string().trim().max(60)).max(20).default([]),
  qa: z.record(z.string(), z.boolean()).optional(),
  isSample: z.boolean().optional(),
});
export type RecordInput = z.input<typeof recordInput>;

export const pageInput = z.object({
  pageNo: z.number().int().min(1).max(100000),
  text: z.string().max(200_000),
  confidence: z.number().min(0).max(100).nullable().optional(),
});
export const pagesPayload = z.object({
  engine: z.string().trim().max(60),
  textLayer: z.enum(textLayerEnum.enumValues).optional(),
  pages: z.array(pageInput).max(2000),
});
