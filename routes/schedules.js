'use strict';
const express = require('express');
const router = express.Router();
const authenticationEnsurer = require('./authentication-ensurer');
const uuid = require('uuid');
const Schedule = require('../models/schedule');
const Candidate = require('../models/candidate');
const User = require('../models/user');
const Availability = require('../models/availability');

router.get('/new', authenticationEnsurer, (req, res, next) => {
  res.render('new', { user: req.user });
});

router.post('/', authenticationEnsurer, (req, res, next) => {
  const scheduleId = uuid.v4();
  const updatedAt = new Date();
  Schedule.create({
    scheduleId: scheduleId,
    scheduleName: req.body.scheduleName.slice(0, 255) || '(名称未設定)',
    memo: req.body.memo,
    createdBy: req.user.id,
    updatedAt: updatedAt
  }).then((schedule) => {
    const candidateNames = req.body.candidates.trim().split('\n').map((s) => s.trim()).filter((s) => s !== "");
    const candidates = candidateNames.map((c) => {
      return {
        candidateName: c,
        scheduleId: schedule.scheduleId
      };
    });
    Candidate.bulkCreate(candidates).then(() => {
      res.redirect('/schedules/' + schedule.scheduleId);
    });
  });
});

router.get('/:scheduleId', authenticationEnsurer, (req, res, next) => {
  Schedule.findOne({
    include: [
      {
        model: User,
        attributes: ['userId', 'username']
      }
    ],
    where: {
      scheduleId: req.params.scheduleId
    },
    order: [['updatedAt', 'DESC']]
  }).then((schedule) => {
    if (schedule) {
      Candidate.findAll({
        where: { scheduleId: schedule.scheduleId },
        order: [['candidateId', 'ASC']]
      }).then((candidates) => {
        Availability.findAll({
          include: [
            {
              model: User,
              attributes: ['userId', 'username']
            }
          ],
          where: { scheduleId: schedule.scheduleId },
          order: [[User, 'username', 'ASC'], ['candidateId', 'ASC']]
        }).then((availabilities) => {
          const availabilityMapMap = new Map();
          availabilities.forEach((a) => {
            const map = availabilityMapMap.get(a.user.userId) || new Map();
            map.set(a.candidateId, a.availability);
            availabilityMapMap.set(a.user.userId, map);
          });

          const userMap = new Map();
          userMap.set(parseInt(req.user.id), {
            isSelf: true,
            userId: parseInt(req.user.id),
            username: req.user.username
          });
          availabilities.forEach((a) => {
            userMap.set(a.user.userId, {
              isSelf: parseInt(req.user.id) === a.user.userId,
              userId: a.user.userId,
              username: a.user.username
            });
          });

          const users = Array.from(userMap).map((keyValue) => keyValue[1]);
          users.forEach((u) => {
            candidates.forEach((c) => {
              const map = availabilityMapMap.get(u.userId) || new Map();
              const a = map.get(c.candidateId) || 0;
              map.set(c.candidateId, a);
              availabilityMapMap.set(u.userId, map)
            });
          });

          res.render('schedule', {
            user: req.user,
            schedule: schedule,
            candidates: candidates,
            users: users,
            availabilityMapMap: availabilityMapMap
          });
        });
      });
    } else {
      const err = new Error('指定された予定は見つかりません');
      err.status = 404;
      next(err);
    }
  });
});

module.exports = router;;