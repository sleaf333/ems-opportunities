-- Starting content as it was loaded with 0001_init.sql. Used only by the
-- upgrade test, to prove 0002 carries existing data over correctly.

insert into public.opportunities
  (title, type, commitment, audience, time_estimate, description, tags, contact_name, contact_email)
values
-- Open to all team members
(
  'Peer Support Committee', 'committee', 'ongoing', 'all', '',
  E'- Supporting team members during challenging times\n- Reaching out when there are tough cases\n- Holding conversations in confidence',
  '{peer support,wellness}', 'EMS Admin', 'admin@ems-wi.com'
),
(
  'Education Committee', 'committee', 'ongoing', 'all', '',
  E'- Creating impactful learning opportunities\n- Developing and delivering high-quality training workshops and sessions\n- Committed to professional development',
  '{education}', 'EMS Admin', 'admin@ems-wi.com'
),
(
  'MedEx', 'committee', 'ongoing', 'all', 'Planning meetings for an annual event',
  E'- Attend MedEx meetings, strategize, and plan this annual event\n- Secure content providers and a schedule that maximizes a variety of topics, recognizes outstanding achievements, and strategizes complex challenges\n- Ensure that the event brings collaboration, teamwork, knowledge, and an opportunity to interact with team members outside of the work environment',
  '{education,events}', 'EMS Admin', 'admin@ems-wi.com'
),
(
  'Wellness Committee', 'committee', 'ongoing', 'all', '',
  E'- Creating opportunities in the pursuit of wellness\n- Reaching out into the community to build bridges and strengthen community ties\n- Hosting fitness, social, and other opportunities for team members to foster relationships and our group culture',
  '{wellness,community,events}', 'EMS Admin', 'admin@ems-wi.com'
),
(
  'Research & Academics Committee', 'committee', 'ongoing', 'all', '',
  E'- Focus on research and publishing opportunities, and case reports\n- Conduct peer reviews of articles for various medical journals\n- Collaborate with residents, medical students, Physician Assistant students, Nurse Practitioner students, pharmacists, pharmacy students, and other healthcare professionals',
  '{research,education}', 'EMS Admin', 'admin@ems-wi.com'
),
(
  'Physician and APC Interview Committees', 'committee', 'ongoing', 'all', '',
  E'- Participate in applicant screening\n- Participate in interviews, site tours, and recruitment events\n- Identify candidates fitting the values of EMS',
  '{recruitment}', 'EMS Admin', 'admin@ems-wi.com'
),
(
  'Disaster Preparedness', 'committee', 'ongoing', 'all', 'Monthly meetings',
  E'- Assist in attending monthly meetings, supporting EMS and the emergency departments regarding disaster preparedness\n- Be a liaison between pertinent parties in the ED and Incident Command Center',
  '{disaster preparedness,operations}', 'EMS Admin', 'admin@ems-wi.com'
),
-- Physicians
(
  'Physician Mentorship and Onboarding', 'committee', 'ongoing', 'physicians', '',
  E'- Mentor new physicians in their first and second years in practice\n- Coach physicians on best practices for throughput, charting, and department management\n- Support physicians in developing their own practice of medicine',
  '{mentorship,leadership}', 'EMS Admin', 'admin@ems-wi.com'
),
(
  'Ultrasound', 'committee', 'ongoing', 'physicians', '',
  E'- Review cases\n- Support workflow with the Ultrasound Director\n- Education',
  '{ultrasound,quality,education}', 'EMS Admin', 'admin@ems-wi.com'
),
(
  'Trauma', 'committee', 'ongoing', 'physicians', '',
  E'- Be involved in all trauma reviews, in process improvement, and in preparation for site visits with the Trauma Committee\n- Attend all Ascension Wisconsin multidisciplinary meetings and trauma meetings',
  '{trauma,quality}', 'EMS Admin', 'admin@ems-wi.com'
),
(
  'Chart Reviews', 'committee', 'ongoing', 'physicians', '',
  E'- Review all charts for Quality Review and feedback\n- Perform chart reviews for the Joint Commission and ABEM Process Improvement',
  '{quality}', 'EMS Admin', 'admin@ems-wi.com'
),
(
  'EMS Prehospital Leadership Team', 'committee', 'ongoing', 'physicians', '',
  E'- Education and lectures\n- Creating collaborative protocol updates, improved communication systems, and new initiatives\n- Community involvement supporting the various EMS teams',
  '{prehospital,leadership,education,community}', 'EMS Admin', 'admin@ems-wi.com'
),
(
  'Missing Charts', 'committee', 'ongoing', 'physicians', '',
  E'- Optimize Ascension''s process to send accurate charts and ensure that all charts are received without errors, so encounters do not go unbilled',
  '{operations,quality}', 'EMS Admin', 'admin@ems-wi.com'
),
-- Shareholders
(
  'Internal EMS Physician Performance Committee', 'committee', 'ongoing', 'shareholders', '',
  E'- Provide actionable feedback to physicians\n- Manage the review process\n- Monitor productivity statistics\n- Assist in career progression/advancement',
  '{leadership,quality}', 'EMS Admin', 'admin@ems-wi.com'
),
(
  'Finance Committee', 'committee', 'ongoing', 'shareholders', '',
  E'- Oversee physician administrative time and compensation\n- Review policies and address resource management\n- Be a steward of financial resources',
  '{finance,leadership}', 'EMS Admin', 'admin@ems-wi.com'
);
