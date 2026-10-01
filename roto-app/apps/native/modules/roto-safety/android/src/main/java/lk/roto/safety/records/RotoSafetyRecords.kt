package lk.roto.safety.records

import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

// `var` (not `val`) matches every Record in the installed expo-modules-core /
// expo-location templates (e.g. LocationOptions) — the JS->Kotlin bridge fills
// these in after construction, not always through the primary constructor.

class StartOptions(
  @Field var thresholdG: Double? = null,
  @Field var minSpeedKmh: Double? = null,
  @Field var lowRate: Boolean? = null,
) : Record

class CrashAlertOptions(
  @Field var countdownS: Int? = null,
  @Field var title: String? = null,
  @Field var body: String? = null,
  @Field var okLabel: String? = null,
  @Field var sendLabel: String? = null,
) : Record
