'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@sally/ui/components/ui/card';
import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Switch } from '@sally/ui/components/ui/switch';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@sally/ui/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@sally/ui/components/ui/alert-dialog';
import { Checkbox } from '@sally/ui/components/ui/checkbox';
import { Pencil, Plus, Trash2, CreditCard } from 'lucide-react';
import { showSuccess, showError } from '@sally/ui';
import {
  getAllFuelCardTypes,
  updateFuelCardType,
  getBrandAcceptanceMap,
  setBrandAcceptance,
  deleteBrand,
  type FuelCardType,
  type BrandAcceptance,
} from '@/features/fuel-cards';
import { queryKeys } from '@/shared/constants';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export default function FuelCardNetworksPage() {
  const qc = useQueryClient();

  const { data: cardTypes, isLoading: isLoadingCards } = useQuery({
    queryKey: queryKeys.admin.fuelCardTypes,
    queryFn: getAllFuelCardTypes,
  });

  const { data: brandAcceptance, isLoading: isLoadingBrands } = useQuery({
    queryKey: queryKeys.admin.brandAcceptance,
    queryFn: getBrandAcceptanceMap,
  });

  // ── Card Type Edit ──
  const [editingCard, setEditingCard] = useState<FuelCardType | null>(null);
  const [editForm, setEditForm] = useState({ displayName: '', description: '', isActive: true });

  const updateCardMutation = useMutation({
    mutationFn: (data: { id: string; displayName: string; description: string; isActive: boolean }) =>
      updateFuelCardType(data.id, {
        displayName: data.displayName,
        description: data.description,
        isActive: data.isActive,
      }),
    onSuccess: () => {
      showSuccess('Fuel card type updated');
      qc.invalidateQueries({ queryKey: queryKeys.admin.fuelCardTypes });
      setEditingCard(null);
    },
    onError: (err: Error) => showError('Failed to update', extractErrorMessage(err)),
  });

  const openCardEdit = (card: FuelCardType) => {
    setEditForm({ displayName: card.displayName, description: card.description || '', isActive: card.isActive });
    setEditingCard(card);
  };

  // ── Brand Acceptance Edit ──
  const [editingBrand, setEditingBrand] = useState<BrandAcceptance | null>(null);
  const [brandForm, setBrandForm] = useState({ brand: '', selectedCards: [] as string[] });
  const [isAddingBrand, setIsAddingBrand] = useState(false);
  const [deletingBrand, setDeletingBrand] = useState<string | null>(null);

  const setBrandMutation = useMutation({
    mutationFn: (data: { brand: string; fuelCardTypeIds: string[] }) =>
      setBrandAcceptance(data.brand, data.fuelCardTypeIds),
    onSuccess: () => {
      showSuccess('Brand acceptance updated');
      qc.invalidateQueries({ queryKey: queryKeys.admin.brandAcceptance });
      setEditingBrand(null);
      setIsAddingBrand(false);
    },
    onError: (err: Error) => showError('Failed to update', extractErrorMessage(err)),
  });

  const deleteBrandMutation = useMutation({
    mutationFn: deleteBrand,
    onSuccess: () => {
      showSuccess('Brand removed');
      qc.invalidateQueries({ queryKey: queryKeys.admin.brandAcceptance });
      setDeletingBrand(null);
    },
    onError: (err: Error) => showError('Failed to delete', extractErrorMessage(err)),
  });

  const openBrandEdit = (ba: BrandAcceptance) => {
    setBrandForm({ brand: ba.brand, selectedCards: ba.cards.map((c) => c.fuelCardTypeId) });
    setEditingBrand(ba);
  };

  const openAddBrand = () => {
    setBrandForm({ brand: '', selectedCards: [] });
    setIsAddingBrand(true);
  };

  const toggleCard = (cardId: string) => {
    setBrandForm((prev) => ({
      ...prev,
      selectedCards: prev.selectedCards.includes(cardId)
        ? prev.selectedCards.filter((id) => id !== cardId)
        : [...prev.selectedCards, cardId],
    }));
  };

  const activeCards = cardTypes?.filter((c) => c.isActive) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Fuel Card Networks
        </h2>
        <p className="text-sm text-muted-foreground">
          Manage platform-level fuel card types and brand acceptance mappings. Changes affect all tenants.
        </p>
      </div>

      {/* Fuel Card Types */}
      <Card>
        <CardHeader>
          <CardTitle>Fuel Card Types</CardTitle>
          <CardDescription>
            Available fuel card networks. Tenants select from active cards in their fleet settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingCards ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="hidden sm:table-cell">ID</TableHead>
                  <TableHead>Display Name</TableHead>
                  <TableHead className="hidden md:table-cell">Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cardTypes?.map((card) => (
                  <TableRow key={card.id}>
                    <TableCell className="hidden sm:table-cell font-mono text-sm">{card.id}</TableCell>
                    <TableCell className="font-medium">{card.displayName}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-xs truncate">
                      {card.description}
                    </TableCell>
                    <TableCell>
                      <Badge variant={card.isActive ? 'default' : 'muted'}>
                        {card.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => openCardEdit(card)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Brand Acceptance Map */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Brand Acceptance Map</CardTitle>
            <CardDescription>
              Which fuel station brands accept which cards. Used by the route planner to pick optimal fuel stops.
            </CardDescription>
          </div>
          <Button size="sm" className="self-start sm:self-auto" onClick={openAddBrand}>
            <Plus className="h-4 w-4 mr-1" />
            Add Brand
          </Button>
        </CardHeader>
        <CardContent>
          {isLoadingBrands ? (
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Brand</TableHead>
                  <TableHead>Accepted Cards</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {brandAcceptance?.map((ba) => (
                  <TableRow key={ba.brand}>
                    <TableCell className="font-medium">{ba.brand}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {ba.cards.map((c) => (
                          <Badge key={c.fuelCardTypeId} variant="outline" className="text-xs">
                            {c.fuelCardTypeId}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openBrandEdit(ba)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-critical hover:text-critical hover:bg-critical/10"
                          onClick={() => setDeletingBrand(ba.brand)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {brandAcceptance?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                      No brand acceptance mappings configured.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Card Type Sheet */}
      <Sheet open={!!editingCard} onOpenChange={(open) => !open && setEditingCard(null)}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-lg p-6 overflow-y-auto"
          onInteractOutside={(e) => e.preventDefault()}
          pinnable
          resizable
          defaultPinned
        >
          <SheetHeader>
            <SheetTitle>Edit Fuel Card Type</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div>
              <Label>ID</Label>
              <Input value={editingCard?.id ?? ''} disabled className="mt-1" />
            </div>
            <div>
              <Label>Display Name</Label>
              <Input
                value={editForm.displayName}
                onChange={(e) => setEditForm((prev) => ({ ...prev, displayName: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={editForm.description}
                onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch
                checked={editForm.isActive}
                onCheckedChange={(c) => setEditForm((prev) => ({ ...prev, isActive: c }))}
              />
            </div>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" className="flex-1" onClick={() => setEditingCard(null)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                loading={updateCardMutation.isPending}
                onClick={() =>
                  editingCard &&
                  updateCardMutation.mutate({
                    id: editingCard.id,
                    ...editForm,
                  })
                }
              >
                Save
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit/Add Brand Sheet */}
      <Sheet
        open={!!editingBrand || isAddingBrand}
        onOpenChange={(open) => {
          if (!open) {
            setEditingBrand(null);
            setIsAddingBrand(false);
          }
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-lg p-6 overflow-y-auto"
          onInteractOutside={(e) => e.preventDefault()}
          pinnable
          resizable
          defaultPinned
        >
          <SheetHeader>
            <SheetTitle>{editingBrand ? 'Edit Brand Acceptance' : 'Add Brand'}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div>
              <Label>Brand Name</Label>
              <Input
                value={brandForm.brand}
                onChange={(e) => setBrandForm((prev) => ({ ...prev, brand: e.target.value }))}
                disabled={!!editingBrand}
                placeholder="e.g., Pilot/Flying J"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Accepted Cards</Label>
              <div className="mt-2 space-y-2">
                {activeCards.map((card) => (
                  <label
                    key={card.id}
                    className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={brandForm.selectedCards.includes(card.id)}
                      onCheckedChange={() => toggleCard(card.id)}
                    />
                    <div>
                      <span className="text-sm font-medium">{card.displayName}</span>
                      <span className="text-xs text-muted-foreground ml-2">({card.id})</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setEditingBrand(null);
                  setIsAddingBrand(false);
                }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                loading={setBrandMutation.isPending}
                disabled={!brandForm.brand.trim() || brandForm.selectedCards.length === 0}
                onClick={() =>
                  setBrandMutation.mutate({
                    brand: brandForm.brand.trim(),
                    fuelCardTypeIds: brandForm.selectedCards,
                  })
                }
              >
                Save
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete Brand Confirmation */}
      <AlertDialog open={!!deletingBrand} onOpenChange={(open) => !open && setDeletingBrand(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Brand?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove &ldquo;{deletingBrand}&rdquo; and all its card acceptance mappings? This affects route planning for
              all tenants.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingBrand && deleteBrandMutation.mutate(deletingBrand)}
              className="bg-critical hover:bg-critical/90 text-white"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
