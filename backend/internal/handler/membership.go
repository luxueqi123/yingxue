package handler

import (
	"github.com/gin-gonic/gin"
	"infinite-canvas/backend/internal/service"
	"net/http"
)

func registerMembershipRoutes(r *gin.RouterGroup, svc *service.Service) {
	r.GET("/membership", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		view, err := svc.Membership(user)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, view)
	})
	r.GET("/admin/membership/plans", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		plans, err := svc.AdminMembershipPlans(user)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"plans": plans})
	})
	save := func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var req service.MembershipPlanRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		plan, err := svc.SaveMembershipPlan(user, c.Param("id"), req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"plan": plan})
	}
	r.POST("/admin/membership/plans", save)
	r.PATCH("/admin/membership/plans/:id", save)
}
