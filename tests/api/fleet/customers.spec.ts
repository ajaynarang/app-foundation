/**
 * Fleet — Customers API (Phase 1 Group 1)
 *
 * Covers all 11 endpoints on CustomersController (customer CRUD + invite +
 * lifecycle + contact sub-routes). Each test satisfies the 9-criteria rubric.
 *
 * Role rules (from RBAC decorators):
 *   - create / list / detail / update / invite /
 *     contacts-*                           → DISPATCHER, ADMIN, OWNER → asDispatcher
 *   - deactivate / reactivate              → ADMIN, OWNER             → asAdmin
 *
 * Schema: shared-types `CustomerSchema` types `email: z.string().optional()`
 * but the backend returns `null` for unset strings — strict parsing fails
 * immediately. We use the hand-written `CustomerSchemas.*` in
 * `@sally/test-utils/schemas` which faithfully mirror the
 * `CustomersService.formatResponse[WithAccess]` outputs.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildCustomer, buildCustomerContact } from '@sally/test-utils/factories';
import { expectContract, expectArrayContract, CustomerSchemas } from '@sally/test-utils/schemas';

const {
  CreateCustomerResponseSchema,
  UpdateCustomerResponseSchema,
  CustomerLifecycleResponseSchema,
  CustomerListItemSchema,
  CustomerDetailSchema,
  CustomerInviteResponseSchema,
  ContactSchema,
  DeleteContactResponseSchema,
} = CustomerSchemas;

test.describe('Fleet · Customers @workflow', () => {
  const activeCreatedCustomerIds: string[] = [];

  test.afterEach(async ({ asAdmin }) => {
    for (const id of activeCreatedCustomerIds.splice(0)) {
      await asAdmin.post(`/customers/${id}/deactivate`, { reason: 'test cleanup' }).catch(() => undefined);
    }
  });

  test('POST /customers creates a customer @workflow @destructive', async ({ asDispatcher }) => {
    const payload = buildCustomer();
    const res = await asDispatcher.post('/customers', payload);
    expect(res.status()).toBe(201);
    const body = expectContract(CreateCustomerResponseSchema, await res.json(), 'POST /customers');

    // Semantic
    expect(body.companyName).toBe(payload.companyName);
    expect(body.customerType).toBe(payload.customerType);
    expect(body.billingEmail).toBe(payload.billingEmail);
    expect(body.status).toBe('ACTIVE');

    activeCreatedCustomerIds.push(body.customerId);

    // Persistence
    const getRes = await asDispatcher.get(`/customers/${body.customerId}`);
    expect(getRes.status()).toBe(200);
  });

  test('GET /customers lists all customers @workflow @destructive', async ({ asDispatcher }) => {
    const payload = buildCustomer();
    const createRes = await asDispatcher.post('/customers', payload);
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    activeCreatedCustomerIds.push(created.customerId);

    const res = await asDispatcher.get('/customers');
    expect(res.status()).toBe(200);
    const items = expectArrayContract(CustomerListItemSchema, await res.json(), {
      allowEmpty: false,
      context: 'GET /customers',
    });

    const seeded = items.find((c) => c.customerId === created.customerId);
    expect(seeded).toBeDefined();
    expect(seeded?.companyName).toBe(payload.companyName);
  });

  test('GET /customers/:customer_id returns customer detail @workflow @destructive', async ({ asDispatcher }) => {
    const payload = buildCustomer();
    const createRes = await asDispatcher.post('/customers', payload);
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    activeCreatedCustomerIds.push(created.customerId);

    const res = await asDispatcher.get(`/customers/${created.customerId}`);
    expect(res.status()).toBe(200);
    const detail = expectContract(CustomerDetailSchema, await res.json(), 'GET /customers/:id');

    // Semantic
    expect(detail.customerId).toBe(created.customerId);
    expect(detail.companyName).toBe(payload.companyName);
    expect(detail.status).toBe('ACTIVE');

    // Persistence (negative): unknown id → 404.
    const missingRes = await asDispatcher.get('/customers/does-not-exist-xyz');
    expect(missingRes.status()).toBe(404);
  });

  test('PUT /customers/:customer_id updates a customer @workflow @destructive', async ({ asDispatcher }) => {
    const payload = buildCustomer();
    const createRes = await asDispatcher.post('/customers', payload);
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    activeCreatedCustomerIds.push(created.customerId);

    const newNotes = 'Phase-1 QA update';
    const res = await asDispatcher.put(`/customers/${created.customerId}`, {
      notes: newNotes,
      creditLimit: 75000,
    });
    expect(res.status()).toBe(200);
    const body = expectContract(UpdateCustomerResponseSchema, await res.json(), 'PUT /customers/:id');

    expect(body.notes).toBe(newNotes);
    expect(body.creditLimit).toBe(75000);

    // Persistence
    const getRes = await asDispatcher.get(`/customers/${created.customerId}`);
    expect(getRes.status()).toBe(200);
    const detail = expectContract(CustomerDetailSchema, await getRes.json());
    expect(detail.notes).toBe(newNotes);
  });

  test('POST /customers/:customer_id/invite sends portal invitation @workflow @destructive', async ({
    asDispatcher,
  }) => {
    // Invite flow: the email MUST match an existing ACTIVE contact — so we
    // create the customer, add a contact, THEN invite that contact's email.
    const customerRes = await asDispatcher.post('/customers', buildCustomer());
    expect(customerRes.status()).toBe(201);
    const customer = await customerRes.json();
    activeCreatedCustomerIds.push(customer.customerId);

    const contact = buildCustomerContact({ role: 'PRIMARY' });
    const contactRes = await asDispatcher.post(`/customers/${customer.customerId}/contacts`, contact);
    expect(contactRes.status()).toBe(201);

    const res = await asDispatcher.post(`/customers/${customer.customerId}/invite`, {
      email: contact.email,
      firstName: contact.firstName,
      lastName: contact.lastName,
    });
    expect(res.status()).toBe(201);
    const body = expectContract(CustomerInviteResponseSchema, await res.json(), 'POST /customers/:id/invite');

    // Semantic
    expect(body.email).toBe(contact.email);
    expect(body.customerId).toBe(customer.customerId);
    expect(body.status).toBe('PENDING');

    // Persistence: the list view should reflect portalAccessStatus INVITED.
    const listRes = await asDispatcher.get('/customers');
    expect(listRes.status()).toBe(200);
    const items = expectArrayContract(CustomerListItemSchema, await listRes.json(), {
      allowEmpty: false,
      context: 'GET /customers post-invite',
    });
    const seeded = items.find((c) => c.customerId === customer.customerId);
    expect(seeded?.portalAccessStatus).toBe('INVITED');
    expect(seeded?.pendingInvitationId).toBe(body.invitationId);
  });

  test('POST /customers/:customer_id/deactivate transitions to INACTIVE @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const createRes = await asDispatcher.post('/customers', buildCustomer());
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();

    const res = await asAdmin.post(`/customers/${created.customerId}/deactivate`, { reason: 'lifecycle test' });
    expect(res.status()).toBe(201);
    const body = expectContract(CustomerLifecycleResponseSchema, await res.json(), 'POST /customers/:id/deactivate');

    expect(body.status).toBe('INACTIVE');
    expect(body.deactivationReason).toBe('lifecycle test');

    // Persistence: GET reflects the transition.
    const getRes = await asDispatcher.get(`/customers/${created.customerId}?includeInactive=true`);
    expect(getRes.status()).toBe(200);
    const detail = expectContract(CustomerDetailSchema, await getRes.json());
    expect(detail.status).toBe('INACTIVE');

    // Already INACTIVE — afterEach deactivate is a harmless no-op via .catch.
  });

  test('POST /customers/:customer_id/reactivate transitions back to ACTIVE @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const createRes = await asDispatcher.post('/customers', buildCustomer());
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();

    const deactRes = await asAdmin.post(`/customers/${created.customerId}/deactivate`, {
      reason: 'prep reactivate test',
    });
    expect(deactRes.status()).toBe(201);

    const res = await asAdmin.post(`/customers/${created.customerId}/reactivate`);
    expect(res.status()).toBe(201);
    const body = expectContract(CustomerLifecycleResponseSchema, await res.json(), 'POST /customers/:id/reactivate');

    expect(body.status).toBe('ACTIVE');
    expect(body.reactivatedAt).not.toBeNull();
    expect(body.deactivatedAt).toBeNull();

    // Persistence
    const getRes = await asDispatcher.get(`/customers/${created.customerId}`);
    expect(getRes.status()).toBe(200);
    const detail = expectContract(CustomerDetailSchema, await getRes.json());
    expect(detail.status).toBe('ACTIVE');

    activeCreatedCustomerIds.push(created.customerId);
  });

  test('GET /customers/:customer_id/contacts lists contacts @workflow @destructive', async ({ asDispatcher }) => {
    const createRes = await asDispatcher.post('/customers', buildCustomer());
    expect(createRes.status()).toBe(201);
    const customer = await createRes.json();
    activeCreatedCustomerIds.push(customer.customerId);

    const contact = buildCustomerContact();
    const addRes = await asDispatcher.post(`/customers/${customer.customerId}/contacts`, contact);
    expect(addRes.status()).toBe(201);
    const added = await addRes.json();

    const res = await asDispatcher.get(`/customers/${customer.customerId}/contacts`);
    expect(res.status()).toBe(200);
    const items = expectArrayContract(ContactSchema, await res.json(), {
      allowEmpty: false,
      context: 'GET /customers/:id/contacts',
    });

    const seeded = items.find((c) => c.contactId === added.contactId);
    expect(seeded).toBeDefined();
    expect(seeded?.email).toBe(contact.email);
    expect(seeded?.role).toBe(contact.role);
  });

  test('POST /customers/:customer_id/contacts creates a contact @workflow @destructive', async ({ asDispatcher }) => {
    const createRes = await asDispatcher.post('/customers', buildCustomer());
    expect(createRes.status()).toBe(201);
    const customer = await createRes.json();
    activeCreatedCustomerIds.push(customer.customerId);

    const payload = buildCustomerContact();
    const res = await asDispatcher.post(`/customers/${customer.customerId}/contacts`, payload);
    expect(res.status()).toBe(201);
    const body = expectContract(ContactSchema, await res.json(), 'POST /customers/:id/contacts');

    // Semantic
    expect(body.firstName).toBe(payload.firstName);
    expect(body.lastName).toBe(payload.lastName);
    expect(body.email).toBe(payload.email);
    expect(body.role).toBe(payload.role);

    // Persistence: GET contacts includes it.
    const listRes = await asDispatcher.get(`/customers/${customer.customerId}/contacts`);
    expect(listRes.status()).toBe(200);
    const items = expectArrayContract(ContactSchema, await listRes.json(), {
      allowEmpty: false,
    });
    expect(items.some((c) => c.contactId === body.contactId)).toBe(true);
  });

  test('PUT /customers/:customer_id/contacts/:contact_id updates a contact @workflow @destructive', async ({
    asDispatcher,
  }) => {
    const createRes = await asDispatcher.post('/customers', buildCustomer());
    expect(createRes.status()).toBe(201);
    const customer = await createRes.json();
    activeCreatedCustomerIds.push(customer.customerId);

    const addRes = await asDispatcher.post(`/customers/${customer.customerId}/contacts`, buildCustomerContact());
    expect(addRes.status()).toBe(201);
    const contact = await addRes.json();

    const newTitle = 'VP of Logistics';
    const res = await asDispatcher.put(`/customers/${customer.customerId}/contacts/${contact.contactId}`, {
      title: newTitle,
      role: 'BILLING',
    });
    expect(res.status()).toBe(200);
    const body = expectContract(ContactSchema, await res.json(), 'PUT /customers/:id/contacts/:contactId');

    expect(body.title).toBe(newTitle);
    expect(body.role).toBe('BILLING');

    // Persistence
    const listRes = await asDispatcher.get(`/customers/${customer.customerId}/contacts`);
    expect(listRes.status()).toBe(200);
    const items = expectArrayContract(ContactSchema, await listRes.json(), {
      allowEmpty: false,
    });
    const found = items.find((c) => c.contactId === contact.contactId);
    expect(found?.title).toBe(newTitle);
    expect(found?.role).toBe('BILLING');
  });

  test('DELETE /customers/:customer_id/contacts/:contact_id removes a contact @workflow @destructive', async ({
    asDispatcher,
  }) => {
    const createRes = await asDispatcher.post('/customers', buildCustomer());
    expect(createRes.status()).toBe(201);
    const customer = await createRes.json();
    activeCreatedCustomerIds.push(customer.customerId);

    // Seed TWO contacts — backend refuses to delete the only contact.
    const firstRes = await asDispatcher.post(
      `/customers/${customer.customerId}/contacts`,
      buildCustomerContact({ role: 'PRIMARY' }),
    );
    expect(firstRes.status()).toBe(201);

    const secondRes = await asDispatcher.post(
      `/customers/${customer.customerId}/contacts`,
      buildCustomerContact({ role: 'OPERATIONS' }),
    );
    expect(secondRes.status()).toBe(201);
    const toDelete = await secondRes.json();

    const res = await asDispatcher.delete(`/customers/${customer.customerId}/contacts/${toDelete.contactId}`);
    expect(res.status()).toBe(200);
    const body = expectContract(
      DeleteContactResponseSchema,
      await res.json(),
      'DELETE /customers/:id/contacts/:contactId',
    );
    expect(body.contactId).toBe(toDelete.contactId);

    // Persistence: the list no longer contains the deleted contact.
    const listRes = await asDispatcher.get(`/customers/${customer.customerId}/contacts`);
    expect(listRes.status()).toBe(200);
    const items = expectArrayContract(ContactSchema, await listRes.json(), {
      allowEmpty: false,
    });
    expect(items.some((c) => c.contactId === toDelete.contactId)).toBe(false);
  });
});
