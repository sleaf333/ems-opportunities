-- Starting content for a NEW project: the interest categories and the
-- committees from the group's committee brochure. Run once, after all files
-- in supabase/migrations. (A project that already ran the original seed with
-- 0001_init.sql does not need this; 0002 converts that data.)

insert into public.interest_categories (name) values
  ('Community'), ('Disaster Preparedness'), ('Education'), ('Events'), ('Finance'),
  ('Leadership'), ('Mentorship'), ('Operations'), ('Peer Support'), ('Prehospital'),
  ('Quality'), ('Recruitment'), ('Research'), ('Trauma'), ('Ultrasound'), ('Wellness')
on conflict do nothing;

with data (title, audience, time_estimate, description, categories) as (
  values
  -- Open to all team members
  (
    'Peer Support Committee', 'all', '',
    E'- Supporting team members during challenging times\n- Reaching out when there are tough cases\n- Holding conversations in confidence',
    array['Peer Support', 'Wellness']
  ),
  (
    'Education Committee', 'all', '',
    E'- Creating impactful learning opportunities\n- Developing and delivering high-quality training workshops and sessions\n- Committed to professional development',
    array['Education']
  ),
  (
    'MedEx', 'all', 'Planning meetings for an annual event',
    E'- Attend MedEx meetings, strategize, and plan this annual event\n- Secure content providers and a schedule that maximizes a variety of topics, recognizes outstanding achievements, and strategizes complex challenges\n- Ensure that the event brings collaboration, teamwork, knowledge, and an opportunity to interact with team members outside of the work environment',
    array['Education', 'Events']
  ),
  (
    'Wellness Committee', 'all', '',
    E'- Creating opportunities in the pursuit of wellness\n- Reaching out into the community to build bridges and strengthen community ties\n- Hosting fitness, social, and other opportunities for team members to foster relationships and our group culture',
    array['Wellness', 'Community', 'Events']
  ),
  (
    'Research & Academics Committee', 'all', '',
    E'- Focus on research and publishing opportunities, and case reports\n- Conduct peer reviews of articles for various medical journals\n- Collaborate with residents, medical students, Physician Assistant students, Nurse Practitioner students, pharmacists, pharmacy students, and other healthcare professionals',
    array['Research', 'Education']
  ),
  (
    'Physician and APC Interview Committees', 'all', '',
    E'- Participate in applicant screening\n- Participate in interviews, site tours, and recruitment events\n- Identify candidates fitting the values of EMS',
    array['Recruitment']
  ),
  (
    'Disaster Preparedness', 'all', 'Monthly meetings',
    E'- Assist in attending monthly meetings, supporting EMS and the emergency departments regarding disaster preparedness\n- Be a liaison between pertinent parties in the ED and Incident Command Center',
    array['Disaster Preparedness', 'Operations']
  ),
  -- Physicians
  (
    'Physician Mentorship and Onboarding', 'physicians', '',
    E'- Mentor new physicians in their first and second years in practice\n- Coach physicians on best practices for throughput, charting, and department management\n- Support physicians in developing their own practice of medicine',
    array['Mentorship', 'Leadership']
  ),
  (
    'Ultrasound', 'physicians', '',
    E'- Review cases\n- Support workflow with the Ultrasound Director\n- Education',
    array['Ultrasound', 'Quality', 'Education']
  ),
  (
    'Trauma', 'physicians', '',
    E'- Be involved in all trauma reviews, in process improvement, and in preparation for site visits with the Trauma Committee\n- Attend all Ascension Wisconsin multidisciplinary meetings and trauma meetings',
    array['Trauma', 'Quality']
  ),
  (
    'Chart Reviews', 'physicians', '',
    E'- Review all charts for Quality Review and feedback\n- Perform chart reviews for the Joint Commission and ABEM Process Improvement',
    array['Quality']
  ),
  (
    'EMS Prehospital Leadership Team', 'physicians', '',
    E'- Education and lectures\n- Creating collaborative protocol updates, improved communication systems, and new initiatives\n- Community involvement supporting the various EMS teams',
    array['Prehospital', 'Leadership', 'Education', 'Community']
  ),
  (
    'Missing Charts', 'physicians', '',
    E'- Optimize Ascension''s process to send accurate charts and ensure that all charts are received without errors, so encounters do not go unbilled',
    array['Operations', 'Quality']
  ),
  -- Partners
  (
    'Internal EMS Physician Performance Committee', 'partners', '',
    E'- Provide actionable feedback to physicians\n- Manage the review process\n- Monitor productivity statistics\n- Assist in career progression/advancement',
    array['Leadership', 'Quality']
  ),
  (
    'Finance Committee', 'partners', '',
    E'- Oversee physician administrative time and compensation\n- Review policies and address resource management\n- Be a steward of financial resources',
    array['Finance', 'Leadership']
  )
),
inserted as (
  insert into public.opportunities
    (title, type, commitment, audience, region, time_estimate, description, contact_name, contact_email)
  select title, 'committee', 'ongoing', audience::public.opp_audience, 'group_wide', time_estimate, description,
         'EMS Admin', 'admin@ems-wi.com'
  from data
  returning id, title
)
insert into public.opportunity_categories (opportunity_id, category_id)
select i.id, c.id
from inserted i
join data d on d.title = i.title
cross join lateral unnest(d.categories) as cat(name)
join public.interest_categories c on c.name = cat.name;
