--
-- PostgreSQL database dump
--

\restrict gA0tEK7zTvK4fQVzXW0Mi05x9IIQv6UG00BRmAImNEVeLPymuNc4dCvkzJ8UIjv

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: clients; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.clients (id, name, company, contact_email, contact_phone, hourly_rate, notes, is_active, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.profiles (id, user_id, name, employee_type, is_active, created_at, updated_at) FROM stdin;
1c0d2b03-c5e6-4674-92fb-b5c6c38a5d03	05101f86-459d-47fd-95fb-9544b8157029	Admin User	Other	t	2026-02-10 10:10:19.081503+00	2026-02-10 10:10:19.081503+00
79d0d35f-ccf9-4758-a674-d180fbf633d9	10132c5b-1e01-4c9b-b3be-63cc2de03dde	Admin	Other	t	2026-06-24 10:05:46.688692+00	2026-06-24 10:05:46.976082+00
d9df5526-45aa-4a81-a83e-1e476a986197	caf7019f-e6f0-4e27-9d3b-552ef65bce19	Aishwarya Singh	Digital Marketer	t	2026-07-02 10:20:40.312398+00	2026-07-02 10:20:40.312398+00
d104346a-1ba9-45bd-9fb7-92edeff2c1db	8f625ece-4aaf-4712-b0b2-00b8d3ce649a	Manas Singh	Video Editor	t	2026-07-02 10:33:17.874718+00	2026-07-02 10:33:17.874718+00
46c9bddc-e614-4f7e-845f-f19e55efe5aa	d3018d69-3a68-4cef-b591-604017864d8e	Nahush Patel	Digital Marketer	t	2026-07-02 10:35:22.752523+00	2026-07-02 10:35:22.752523+00
\.


--
-- Data for Name: messages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.messages (id, sender_id, receiver_id, content, created_at, is_edited, is_deleted, attachment_url, attachment_type, attachment_name, is_read) FROM stdin;
c15d4129-42ac-4b76-962e-3815d73f14a9	d3018d69-3a68-4cef-b591-604017864d8e	\N	This message was deleted	2026-07-02 11:10:06.172079+00	f	t	\N	\N	\N	f
f5d75077-3422-4dd4-8dbb-5538f0c6982f	d3018d69-3a68-4cef-b591-604017864d8e	\N	This message was deleted	2026-07-02 11:10:11.75281+00	f	t	\N	\N	\N	f
decc0be5-e90f-4b43-b1fb-6bfa07ff898f	d3018d69-3a68-4cef-b591-604017864d8e	\N	This message was deleted	2026-07-02 11:14:56.220271+00	f	t	\N	\N	\N	f
d8ac0d9e-3154-42d3-ad78-de56277d17ea	d3018d69-3a68-4cef-b591-604017864d8e	\N	This message was deleted	2026-07-02 10:36:50.996116+00	f	t	\N	\N	\N	f
5cdbfdbe-7765-4bca-b957-b2a34bee46d9	05101f86-459d-47fd-95fb-9544b8157029	\N	🫠	2026-08-14 16:29:51.419755+00	f	f	\N	\N	\N	f
46722510-7024-4c90-a8bd-2faee53c11f1	d3018d69-3a68-4cef-b591-604017864d8e	\N	hi	2026-07-02 10:35:58.272006+00	f	f	\N	\N	\N	f
27f2f409-3914-4737-a533-53e893b15eae	8f625ece-4aaf-4712-b0b2-00b8d3ce649a	\N	hello pagl lo	2026-07-02 10:36:35.388491+00	f	f	\N	\N	\N	f
562f3fed-833e-473e-8483-924449cf8eaa	8f625ece-4aaf-4712-b0b2-00b8d3ce649a	\N	bhhook lagi	2026-07-02 10:36:56.856036+00	f	f	\N	\N	\N	f
d4c63193-3a08-4de0-a47e-802595cca0a9	caf7019f-e6f0-4e27-9d3b-552ef65bce19	\N	kkkkkkkkkkkkkkk	2026-07-02 10:36:59.708131+00	f	f	\N	\N	\N	f
e1383140-d677-487e-bbed-412b602a6d76	8f625ece-4aaf-4712-b0b2-00b8d3ce649a	\N	haaaaaaaaaaaaaaaaaaaaaaa	2026-07-02 10:37:03.562264+00	f	f	\N	\N	\N	f
1a625b40-092d-42da-b210-26ebcef6a9d6	caf7019f-e6f0-4e27-9d3b-552ef65bce19	\N	hvrgthyiuop;'[	2026-07-02 10:37:10.389633+00	f	f	\N	\N	\N	f
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.notifications (id, user_id, kind, title, body, link_url, is_read, created_at) FROM stdin;
\.


--
-- Data for Name: projects; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.projects (id, client_id, name, description, status, deadline, budget_hours, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: recurring_task_templates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.recurring_task_templates (id, title, description, category, assignee_id, client_id, project_id, priority, target_minutes, is_billable, cadence, next_run_at, is_active, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: report_share_links; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.report_share_links (id, client_id, token, expires_at, date_from, date_to, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: tasks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tasks (id, user_id, title, description, category, date, status, created_at, updated_at, target_minutes, completion_notes, project_link, client_id, project_id, priority, due_date, is_billable, hourly_rate_override, approval_status, approved_by, approved_at, rejection_reason, recurring_template_id) FROM stdin;
7817da3f-215e-4582-8fe9-4f7a8c003fd9	d3018d69-3a68-4cef-b591-604017864d8e	Ad report	Check grah siddhi's google ads perfromence. optimise it if needed such as keywords, budget etc. Also make ad report for meta ads as Grah siddhi sir had asked for it.	Marketing	2026-07-03	Finished	2026-07-03 07:29:01.425882+00	2026-07-03 15:01:50.605051+00	\N	\N	\N	\N	\N	Medium	\N	f	\N	Not Required	\N	\N	\N	\N
13eff378-dd15-4595-a743-3429b839a0ae	caf7019f-e6f0-4e27-9d3b-552ef65bce19	Daily creatives	Make one post for grah siddhi, get the ad creative approved of grah siddhi , and make carsoule for nexsa.	Design	2026-07-03	Finished	2026-07-03 07:21:10.707753+00	2026-07-04 08:28:57.327479+00	\N	\N	\N	\N	\N	Medium	\N	f	\N	Not Required	\N	\N	\N	\N
bc90fe5b-ff4b-4ee1-ae09-017d251ac8bb	d3018d69-3a68-4cef-b591-604017864d8e	Create Grah Siddhi Creative	Assigned to Nahush Patel. Create a social media creative for Grah Siddhi using the company profile and brand priorities: all-in-one home construction, free architectural/electrical/plumbing planning, free home visit consultation, customer control over materials/interiors, transparency, legal assurance, and 5-year support. Keep the design conversion-focused and aligned with Grah Siddhi branding.	Design	2026-07-11	Finished	2026-07-11 06:28:15.012267+00	2026-07-11 08:19:16.84652+00	120	Done Grah Siddhi Creative	https://canva.link/7v2ub33n7x8be6q	\N	\N	Medium	\N	f	\N	Not Required	\N	\N	\N	\N
\.


--
-- Data for Name: task_attachments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.task_attachments (id, task_id, uploaded_by, file_path, file_name, file_size, content_type, created_at) FROM stdin;
\.


--
-- Data for Name: task_comments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.task_comments (id, task_id, user_id, content, mentions, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: time_sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.time_sessions (id, task_id, start_time, end_time, created_by) FROM stdin;
053a8405-a292-4daa-b101-82f82e9f8d03	13eff378-dd15-4595-a743-3429b839a0ae	1783071002442	1783075043207	caf7019f-e6f0-4e27-9d3b-552ef65bce19
0e99eb03-93fb-422d-8d7a-8c72344c59cc	7817da3f-215e-4582-8fe9-4f7a8c003fd9	1783088397989	1783090909265	d3018d69-3a68-4cef-b591-604017864d8e
29d09604-a9f3-4176-90b3-c9d421438016	13eff378-dd15-4595-a743-3429b839a0ae	1783153722152	1783153737115	caf7019f-e6f0-4e27-9d3b-552ef65bce19
0d01c8ca-aef0-452b-a45a-67354f52c067	bc90fe5b-ff4b-4ee1-ae09-017d251ac8bb	1783755388278	1783757956196	d3018d69-3a68-4cef-b591-604017864d8e
\.


--
-- Data for Name: user_roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_roles (id, user_id, role) FROM stdin;
ae5b9dc2-d84f-4773-b00f-c2bf2a14ed1e	05101f86-459d-47fd-95fb-9544b8157029	admin
2372b1fb-b889-4796-bfba-5a76f81b79b7	10132c5b-1e01-4c9b-b3be-63cc2de03dde	admin
d8f5cc05-55fb-40fa-9324-5d39b82294c9	caf7019f-e6f0-4e27-9d3b-552ef65bce19	employee
3f213822-31dc-468d-a2ad-3e2bf3fe6f25	8f625ece-4aaf-4712-b0b2-00b8d3ce649a	employee
9a430bbf-b82c-4ded-a8e8-47a6bbdf5c4d	d3018d69-3a68-4cef-b591-604017864d8e	employee
\.


--
-- PostgreSQL database dump complete
--

\unrestrict gA0tEK7zTvK4fQVzXW0Mi05x9IIQv6UG00BRmAImNEVeLPymuNc4dCvkzJ8UIjv

