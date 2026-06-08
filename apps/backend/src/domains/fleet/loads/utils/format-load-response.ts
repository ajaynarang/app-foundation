/**
 * Shared pure formatter used by every read-path of LoadsService and its
 * collaborators. Kept as a module-level function (no `this`) so the split
 * services can reuse it without circular DI dependencies.
 */
export function formatLoadResponse(load: any) {
  const stopsData = load.stops.map((loadStop: any) => ({
    id: loadStop.id,
    stopId: loadStop.stopId,
    sequenceOrder: loadStop.sequenceOrder,
    actionType: loadStop.actionType,
    appointmentDate: loadStop.appointmentDate ? loadStop.appointmentDate.toISOString().split('T')[0] : null,
    earliestArrival: loadStop.earliestArrival,
    latestArrival: loadStop.latestArrival,
    estimatedDockHours: loadStop.estimatedDockHours,
    actualDockHours: loadStop.actualDockHours,
    facilityUnverified: loadStop.facilityUnverified ?? false,
    suggestedMergeStopId: loadStop.stop?.suggestedMergeStopId ?? null,
    status: loadStop.status || 'PENDING',
    arrivedAt: loadStop.arrivedAt?.toISOString() || null,
    completedAt: loadStop.completedAt?.toISOString() || null,
    bolNumber: loadStop.bolNumber || null,
    podSignedBy: loadStop.podSignedBy || null,
    driverNotes: loadStop.driverNotes || null,
    dispatcherNotes: loadStop.dispatcherNotes || null,
    actualWeight: loadStop.actualWeight ?? null,
    actualPieces: loadStop.actualPieces ?? null,
    detentionMinutes: loadStop.detentionMinutes ?? null,
    stopName: loadStop.stop?.name || null,
    stopCity: loadStop.stop?.city || null,
    stopState: loadStop.stop?.state || null,
    stopAddress: loadStop.stop?.address || null,
    stopZipCode: loadStop.stop?.zipCode || null,
    stopLat: loadStop.stop?.lat ?? null,
    stopLon: loadStop.stop?.lon ?? null,
    stopStopId: loadStop.stop?.stopId || null,
    uploadedDocuments: loadStop.uploadedDocuments ?? [],
  }));

  return {
    id: load.id,
    loadNumber: load.loadNumber,
    status: load.status,
    weightLbs: load.weightLbs,
    commodityType: load.commodityType,
    specialRequirements: load.specialRequirements,
    customerName: load.customerName,
    requiredEquipmentType: load.requiredEquipmentType ?? null,
    referenceNumber: load.referenceNumber,
    rateCents: load.rateCents,
    billingStatus: load.billingStatus ?? null,
    pieces: load.pieces,
    intakeSource: load.intakeSource,
    intakeMetadata: load.intakeMetadata ?? null,
    customerId: load.customerId,
    driverId: load.driverId,
    driverName: load.driver?.name || null,
    vehicleId: load.vehicleId,
    vehicleNumber: load.vehicle?.unitNumber || null,
    isActive: load.isActive,
    pickupDate: load.pickupDate ? load.pickupDate.toISOString().split('T')[0] : null,
    deliveryDate: load.deliveryDate ? load.deliveryDate.toISOString().split('T')[0] : null,
    originCity: load.originCity || null,
    originState: load.originState || null,
    destinationCity: load.destinationCity || null,
    destinationState: load.destinationState || null,
    estimatedMiles: load.estimatedMiles ?? null,
    actualMiles: load.actualMiles ?? null,
    totalMiles: load.totalMiles ?? null,
    estimatedDriveHours: load.estimatedDriveHours ?? null,
    mileageProvider: load.mileageProvider ?? null,
    mileageCalculatedAt: load.mileageCalculatedAt?.toISOString() || null,
    routePlan: load.routePlanLoads?.[0]?.plan
      ? {
          planId: load.routePlanLoads[0].plan.planId,
          status: load.routePlanLoads[0].plan.status,
        }
      : null,
    assignedAt: load.assignedAt?.toISOString() || null,
    inTransitAt: load.inTransitAt?.toISOString() || null,
    deliveredAt: load.deliveredAt?.toISOString() || null,
    cancelledAt: load.cancelledAt?.toISOString() || null,
    onHoldAt: load.onHoldAt?.toISOString() || null,
    onHoldReason: load.onHoldReason || null,
    tonuAt: load.tonuAt?.toISOString() || null,
    tonuReason: load.tonuReason || null,
    minTempF: load.minTempF ?? null,
    maxTempF: load.maxTempF ?? null,
    hazmatClass: load.hazmatClass || null,
    recurringLaneId: load.recurringLaneId ?? null,
    isRelay: load.isRelay ?? false,
    tripId: load.trip?.tripId ?? null,
    tripOrder: load.tripOrder ?? null,
    tripLoadCount: load.trip?.loadCount ?? null,
    createdAt: load.createdAt.toISOString(),
    updatedAt: load.updatedAt.toISOString(),
    stops: stopsData,
    ...(load.isRelay && load.legs?.length > 0
      ? {
          legs: load.legs.map((leg: any) => ({
            legId: leg.legId,
            sequence: leg.sequence,
            status: leg.status,
            driverId: leg.driverId,
            vehicleId: leg.vehicleId,
            actualMiles: leg.actualMiles,
            originStopId: leg.originStopId,
            destStopId: leg.destStopId,
            driverName: leg.driver?.name || null,
            driverStringId: leg.driver?.driverId || null,
            vehicleUnitNumber: leg.vehicle?.unitNumber || null,
            vehicleStringId: leg.vehicle?.vehicleId || null,
            assignedAt: leg.assignedAt?.toISOString?.() || null,
            pickedUpAt: leg.pickedUpAt?.toISOString?.() || null,
            deliveredAt: leg.deliveredAt?.toISOString?.() || null,
          })),
        }
      : {}),
    activeLeg:
      load.isRelay && load.legs?.length > 0
        ? (() => {
            const legs = load.legs;
            const active =
              legs.find((l: any) => l.status !== 'DELIVERED' && l.status !== 'CANCELLED') ?? legs[legs.length - 1];
            return active
              ? {
                  legId: active.legId,
                  sequence: active.sequence,
                  status: active.status,
                  driverName: active.driver?.name ?? null,
                  vehicleUnitNumber: active.vehicle?.unitNumber ?? null,
                  actualMiles: active.actualMiles ?? null,
                }
              : null;
          })()
        : undefined,
    ...(load.invoices
      ? {
          invoices: load.invoices.map((inv: any) => ({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            status: inv.status,
            totalCents: inv.totalCents,
            balanceCents: inv.balanceCents,
            dueDate: inv.dueDate?.toISOString()?.split('T')[0] ?? null,
            paidDate: inv.paidDate?.toISOString()?.split('T')[0] ?? null,
            createdAt: inv.createdAt?.toISOString() ?? null,
          })),
        }
      : {}),
  };
}
